import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { credentialFrom } from './session-cookie.mjs';
import { assertDeviceStore, createDeviceApprovalStore, requireApprovedDevice } from './device-approval.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_TITLE = 200;
const MAX_BODY = 5000;

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

function readBody(request) {
  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { title, body: text } = body;
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE
      || typeof text !== 'string' || text.length > MAX_BODY) return null;
  return { title: title.trim(), body: text };
}

// verify(authorization) -> { userId } | null.  store holds all database access.
// devices.status(ownerId, sessionId) -> approval status (step 11). Required: see device-approval.mjs.
export function createNotesApi({ verify, store, devices }) {
  assertDeviceStore(devices);
  // Order: login (401) -> method (405) -> device approval (403) -> data. Every route of this
  // API goes through here, so calling the data route directly (skipping any screen) still meets
  // the device check, and no note is read before it passes.
  async function guard(request, response, allowed) {
    // Bearer header (non-browser clients) or the httpOnly session cookie (browser); see
    // src/session-cookie.mjs. A cookie-authenticated unsafe request from another origin stops here.
    const credential = credentialFrom(request);
    if (credential.error) { send(response, 403, { error: credential.error }); return null; }
    let user = null;
    try { user = await verify(credential.authorization); } catch { user = null; }
    if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return null; }
    if (!allowed.includes(request.method)) {
      response.setHeader('Allow', allowed.join(', '));
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
    if (!(await requireApprovedDevice(devices, user, response))) return null;
    return user;
  }

  const run = async (response, work) => {
    try { await work(); } catch { send(response, 502, { error: 'NOTES_UNAVAILABLE' }); }
  };

  return {
    async collection(request, response) {
      const user = await guard(request, response, ['GET', 'POST']);
      if (!user) return;
      await run(response, async () => {
        if (request.method === 'GET') {
          send(response, 200, await store.list(user.userId));
          return;
        }
        const input = readBody(request);
        if (!input) { send(response, 400, { error: 'INVALID_NOTE' }); return; }
        send(response, 201, { id: await store.create(user.userId, input) });
      });
    },

    async item(request, response) {
      const user = await guard(request, response, ['GET', 'PUT', 'DELETE']);
      if (!user) return;
      const id = request.query?.id;
      if (typeof id !== 'string' || !UUID.test(id)) { send(response, 404, { error: 'NOT_FOUND' }); return; }
      await run(response, async () => {
        if (request.method === 'GET') {
          const note = await store.get(user.userId, id);
          if (!note) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, note);
        } else if (request.method === 'PUT') {
          const input = readBody(request);
          if (!input) { send(response, 400, { error: 'INVALID_NOTE' }); return; }
          const note = await store.update(user.userId, id, input);
          if (!note) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, note);
        } else {
          if (!(await store.remove(user.userId, id))) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, { id });
        }
      });
    },
  };
}

const toNote = row => ({ id: row.id, title: row.title, body: row.content });

// Same hash as src/notes-restore-api.mjs (sha256 hex of the UTF-8 content), which re-checks it
// before any restore. Duplicated on purpose: each API file stays self-contained.
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

// Step 10 backup snapshot — taken ONLY when a note is created (POST), never on update (PUT).
// The restore card asks for "a copy verified BEFORE the breach" (침해 전에 검증한 자료). If every
// PUT refreshed the backup, a tampering PUT would overwrite the recovery point with the tampered
// text and restore would faithfully bring the tampered text back. So the creation-time state is
// the recovery point, and PUT/DELETE never touch notes_backup.
// The snapshot is built from the row the database returned (id, owner_id, title, content as
// actually stored), not from the request, so the hash describes what is really in `notes`.
// Failure posture: the note insert already committed and the client needs its id, so a failed
// snapshot does NOT turn the save into an error. It is not swallowed silently either: one
// server log line with the note id (no content, no owner, no key) goes to the Vercel function
// log. Such a note has no recovery point and its restore answers 404 until a backfill
// (see supabase/schema-notes-backup.sql) is run for it.
export function createSupabaseStore(client) {
  const check = ({ data, error }) => { if (error) throw new Error('db'); return data; };
  async function snapshot(row) {
    try {
      check(await client.from('notes_backup').insert({
        source_note_id: row.id, owner_id: row.owner_id, title: row.title,
        content: row.content, content_sha256: sha256(row.content),
      }));
    } catch {
      console.error(`notes_backup: creation snapshot failed for note ${row.id}`);
    }
  }
  return {
    async list(ownerId) {
      return check(await client.from('notes').select('id,title,content')
        .eq('owner_id', ownerId).order('created_at', { ascending: true })).map(toNote);
    },
    async create(ownerId, { title, body }) {
      const row = check(await client.from('notes').insert({ owner_id: ownerId, title, content: body })
        .select('id,owner_id,title,content').single());
      await snapshot(row);
      return row.id;
    },
    async get(ownerId, id) {
      const row = check(await client.from('notes').select('id,title,content')
        .eq('id', id).eq('owner_id', ownerId).maybeSingle());
      return row ? toNote(row) : null;
    },
    async update(ownerId, id, { title, body }) {
      const row = check(await client.from('notes').update({ title, content: body })
        .eq('id', id).eq('owner_id', ownerId).select('id,title,content').maybeSingle());
      return row ? toNote(row) : null;
    },
    async remove(ownerId, id) {
      return check(await client.from('notes').delete()
        .eq('id', id).eq('owner_id', ownerId).select('id')).length > 0;
    },
  };
}

// Built once per server instance from environment variables and aleph.config.json.
export function createRuntimeNotesApi(config, env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(url, key, { auth: { persistSession: false } });
  return createNotesApi({ verify, store: createSupabaseStore(client),
    devices: createDeviceApprovalStore(client) });
}
