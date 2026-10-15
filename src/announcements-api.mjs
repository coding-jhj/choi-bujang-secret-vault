import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { assertDeviceStore, createDeviceApprovalStore, requireApprovedDevice } from './device-approval.mjs';

// Announcements API. Parallel sibling of notes-api.mjs (kept separate on purpose; notes-api.mjs is untouched).
//
// Permission model: `owner_id` IS the instructor permission. Whoever created ("owns") an
// announcement row is the only principal who may read, modify, or delete that row. There is
// no separate role field, by design. Every store query below filters by the caller's
// verified userId (`.eq('owner_id', ownerId)`), so another user's id yields 404 NOT_FOUND —
// the same answer as a non-existent id, so existence is not leaked.
//
// The list (collection GET) is owner-scoped too, matching notes. Leaving it unscoped would let
// any logged-in user enumerate every announcement id and title (an information leak and the
// first step of a BOLA attack), so scoping it is the safe default. If announcements later need
// to be readable by everyone, that should be a separate, explicitly read-only route.
//
// The ALEPH decider only checks route shape (resource_zone); it has no DB access and cannot
// know who owns a row. This file is the layer that enforces per-row ownership.
//
// Only `title` and `body` are read from the request body. owner_id always comes from the
// verified token, never from client input.
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
// devices: step 11 device approval store (required). Same gate and order as notes-api.mjs.
export function createAnnouncementsApi({ verify, store, devices }) {
  assertDeviceStore(devices);
  async function guard(request, response, allowed) {
    let user = null;
    try { user = await verify(request.headers?.authorization); } catch { user = null; }
    if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return null; }
    if (!allowed.includes(request.method)) {
      response.setHeader('Allow', allowed.join(', '));
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
    if (!(await requireApprovedDevice(devices, user, request, response))) return null;
    return user;
  }

  const run = async (response, work) => {
    try { await work(); } catch { send(response, 502, { error: 'ANNOUNCEMENTS_UNAVAILABLE' }); }
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
        if (!input) { send(response, 400, { error: 'INVALID_ANNOUNCEMENT' }); return; }
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
          const item = await store.get(user.userId, id);
          if (!item) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, item);
        } else if (request.method === 'PUT') {
          const input = readBody(request);
          if (!input) { send(response, 400, { error: 'INVALID_ANNOUNCEMENT' }); return; }
          const item = await store.update(user.userId, id, input);
          if (!item) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, item);
        } else {
          if (!(await store.remove(user.userId, id))) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, { id });
        }
      });
    },
  };
}

const toAnnouncement = row => ({ id: row.id, title: row.title, body: row.content });

export function createSupabaseStore(client) {
  const check = ({ data, error }) => { if (error) throw new Error('db'); return data; };
  return {
    async list(ownerId) {
      return check(await client.from('announcements').select('id,title,content')
        .eq('owner_id', ownerId).order('created_at', { ascending: true })).map(toAnnouncement);
    },
    async create(ownerId, { title, body }) {
      return check(await client.from('announcements').insert({ owner_id: ownerId, title, content: body })
        .select('id').single()).id;
    },
    async get(ownerId, id) {
      const row = check(await client.from('announcements').select('id,title,content')
        .eq('id', id).eq('owner_id', ownerId).maybeSingle());
      return row ? toAnnouncement(row) : null;
    },
    async update(ownerId, id, { title, body }) {
      const row = check(await client.from('announcements').update({ title, content: body })
        .eq('id', id).eq('owner_id', ownerId).select('id,title,content').maybeSingle());
      return row ? toAnnouncement(row) : null;
    },
    async remove(ownerId, id) {
      return check(await client.from('announcements').delete()
        .eq('id', id).eq('owner_id', ownerId).select('id')).length > 0;
    },
  };
}

// Built once per server instance from environment variables and aleph.config.json.
export function createRuntimeAnnouncementsApi(config, env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(url, key, { auth: { persistSession: false } });
  return createAnnouncementsApi({ verify, store: createSupabaseStore(client),
    devices: createDeviceApprovalStore(client) });
}
