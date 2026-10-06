import { createClient } from '@supabase/supabase-js';

const MAX_EMAIL = 320;
const MAX_SECRET = 256;
const MAX_TOKEN = 8192;
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u;

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

function readJson(request) {
  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

// 브라우저에는 토큰과 이메일만 돌려준다. 사용자 ID·원본 응답 전체는 내보내지 않는다.
function toSession(session) {
  if (!text(session?.access_token, MAX_TOKEN) || !text(session?.refresh_token, MAX_TOKEN)) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: Number.isSafeInteger(session.expires_at) ? session.expires_at : null,
    email: typeof session.user?.email === 'string' ? session.user.email : '',
  };
}

// newClient() must return a fresh Supabase client for every request: a client that
// has signed a user in would otherwise send that user's token on later calls.
export function createAuthApi({ newClient }) {
  const login = async (request, response) => {
    const input = readJson(request);
    if (!input || !text(input.email, MAX_EMAIL) || !text(input.password, MAX_SECRET)) {
      send(response, 400, { error: 'INVALID_LOGIN' });
      return;
    }
    const { data, error } = await newClient().auth.signInWithPassword(
      { email: input.email, password: input.password });
    const session = error ? null : toSession(data?.session);
    if (!session) { send(response, 401, { error: 'LOGIN_FAILED' }); return; }
    send(response, 200, session);
  };

  const refresh = async (request, response) => {
    const input = readJson(request);
    if (!input || !text(input.refreshToken, MAX_TOKEN)) {
      send(response, 400, { error: 'INVALID_LOGIN' });
      return;
    }
    const { data, error } = await newClient().auth.refreshSession(
      { refresh_token: input.refreshToken });
    const session = error ? null : toSession(data?.session);
    if (!session) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    send(response, 200, session);
  };

  const logout = async (request, response) => {
    const match = BEARER.exec(request.headers?.authorization ?? '');
    if (!match) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    const { error } = await newClient().auth.admin.signOut(match[1]);
    if (error) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    send(response, 200, { ok: true });
  };

  const actions = { login, refresh, logout };

  return async function handle(request, response) {
    const action = request.query?.action;
    const run = typeof action === 'string' && Object.hasOwn(actions, action) ? actions[action] : null;
    if (!run) { send(response, 404, { error: 'NOT_FOUND' }); return; }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return;
    }
    try { await run(request, response); } catch { send(response, 502, { error: 'AUTH_UNAVAILABLE' }); }
  };
}

export function createRuntimeAuthApi(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  return createAuthApi({
    newClient: () => createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
  });
}
