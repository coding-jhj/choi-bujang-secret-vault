import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

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
export function createNotesApi({ verify, store }) {
  async function guard(request, response, allowed) {
    let user = null;
    try { user = await verify(request.headers?.authorization); } catch { user = null; }
    if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return null; }
    if (!allowed.includes(request.method)) {
      response.setHeader('Allow', allowed.join(', '));
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
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
          const note = await store.get(id);
          if (!note) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, note);
        } else if (request.method === 'PUT') {
          const input = readBody(request);
          if (!input) { send(response, 400, { error: 'INVALID_NOTE' }); return; }
          const note = await store.update(id, input);
          if (!note) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, note);
        } else {
          if (!(await store.remove(id))) { send(response, 404, { error: 'NOT_FOUND' }); return; }
          send(response, 200, { id });
        }
      });
    },
  };
}

const toNote = row => ({ id: row.id, title: row.title, body: row.content });

export function createSupabaseStore(client) {
  const check = ({ data, error }) => { if (error) throw new Error('db'); return data; };
  return {
    async list(ownerId) {
      return check(await client.from('notes').select('id,title,content')
        .eq('owner_id', ownerId).order('created_at', { ascending: true })).map(toNote);
    },
    async create(ownerId, { title, body }) {
      return check(await client.from('notes').insert({ owner_id: ownerId, title, content: body })
        .select('id').single()).id;
    },
    async get(id) {
      const row = check(await client.from('notes').select('id,title,content').eq('id', id).maybeSingle());
      return row ? toNote(row) : null;
    },
    async update(id, { title, body }) {
      const row = check(await client.from('notes').update({ title, content: body })
        .eq('id', id).select('id,title,content').maybeSingle());
      return row ? toNote(row) : null;
    },
    async remove(id) {
      return check(await client.from('notes').delete().eq('id', id).select('id')).length > 0;
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
  return createNotesApi({ verify, store: createSupabaseStore(client) });
}
