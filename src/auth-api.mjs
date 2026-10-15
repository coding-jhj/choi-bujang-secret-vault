import { createClient } from '@supabase/supabase-js';
import { REFRESH_COOKIE, clearedCookies, credentialFrom, isBrowserSafeWrite, isSameOrigin,
  readCookie, sessionCookies } from './session-cookie.mjs';
import { createLoginVerifier } from './verify-login.mjs';
import { createDeviceApprovalStore } from './device-approval.mjs';

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

// 11단계 보완 2: 토큰은 응답 본문에 넣지 않고 httpOnly 쿠키로만 보낸다(src/session-cookie.mjs).
// 본문에는 화면 표시용 이메일과 만료 시각만 둔다. 사용자 ID·원본 응답 전체는 내보내지 않는다.
function toSession(session) {
  if (!text(session?.access_token, MAX_TOKEN) || !text(session?.refresh_token, MAX_TOKEN)) return null;
  const cookies = sessionCookies({ accessToken: session.access_token, refreshToken: session.refresh_token });
  if (!cookies) return null;
  return {
    cookies,
    body: {
      expiresAt: Number.isSafeInteger(session.expires_at) ? session.expires_at : null,
      email: typeof session.user?.email === 'string' ? session.user.email : '',
    },
  };
}

function sendSession(response, session) {
  response.setHeader('Set-Cookie', session.cookies);
  send(response, 200, session.body);
}

function sendCleared(response, status, body) {
  response.setHeader('Set-Cookie', clearedCookies());
  send(response, status, body);
}

// newClient() must return a fresh Supabase client for every request: a client that
// has signed a user in would otherwise send that user's token on later calls.
// verify: the same login verifier the data routes use. devices: the step-11 approval store
// (needs revoke). Both are required so logout can never silently skip revocation.
export function createAuthApi({ newClient, verify, devices }) {
  if (typeof verify !== 'function' || typeof devices?.revokeAllApproved !== 'function') {
    throw new TypeError('logout_revocation_required');
  }
  // Login carries no credential yet; a browser-marked request must still be same-origin
  // (login CSRF: a foreign page silently signing the victim in to the attacker's account).
  const login = async (request, response) => {
    if (!isBrowserSafeWrite(request)) { send(response, 403, { error: 'CSRF_REJECTED' }); return; }
    const input = readJson(request);
    if (!input || !text(input.email, MAX_EMAIL) || !text(input.password, MAX_SECRET)) {
      send(response, 400, { error: 'INVALID_LOGIN' });
      return;
    }
    const { data, error } = await newClient().auth.signInWithPassword(
      { email: input.email, password: input.password });
    const session = error ? null : toSession(data?.session);
    if (!session) { send(response, 401, { error: 'LOGIN_FAILED' }); return; }
    sendSession(response, session);
  };

  // The refresh token is read ONLY from its httpOnly cookie (never from the body), and the
  // request must be same-origin because that cookie is ambient. Failure clears both cookies.
  const refresh = async (request, response) => {
    const token = readCookie(request, REFRESH_COOKIE);
    if (!token) { sendCleared(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    if (!isSameOrigin(request)) { send(response, 403, { error: 'CSRF_REJECTED' }); return; }
    const { data, error } = await newClient().auth.refreshSession({ refresh_token: token });
    const session = error ? null : toSession(data?.session);
    if (!session) { sendCleared(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    sendSession(response, session);
  };

  // Accepts the access token from the Bearer header or the cookie (same rule as the data APIs).
  // Every answer past the CSRF check clears both cookies, so the browser is signed out locally
  // even when the server-side sign-out fails.
  //
  // Step 12 (revoked-identity retry): ending the Supabase session alone is not enough. The data
  // routes verify the access token with getClaims, which can check the signature locally (JWKS)
  // without asking whether the session still exists, so a copied access token of a logged-out
  // session would keep opening data until it expires. So logout ALSO revokes this session's
  // device_approvals row, using the same verified (userId, sessionId) the device gate uses.
  // The token is verified BEFORE signOut (after signOut a server-side check could no longer
  // derive the session). Revocation is attempted first and signOut still runs if it fails; a
  // failed revocation is reported (502), never answered as a clean logout.
  const logout = async (request, response) => {
    const credential = credentialFrom(request);
    if (credential.error) { send(response, 403, { error: credential.error }); return; }
    const match = BEARER.exec(credential.authorization ?? '');
    if (!match) { sendCleared(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    let user = null;
    try { user = await verify(credential.authorization); } catch { user = null; }
    // signOut below uses the default 'global' scope (all of this owner's sessions end), so every
    // approved session row of this owner is revoked, not only the current one.
    let revoked = true;
    if (user) {
      try { await devices.revokeAllApproved(user.userId); } catch {
        revoked = false;
        console.error('logout: device approval revoke failed');
      }
    }
    const { error } = await newClient().auth.admin.signOut(match[1]);
    if (!revoked) { sendCleared(response, 502, { error: 'LOGOUT_REVOKE_FAILED' }); return; }
    if (error) { sendCleared(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
    sendCleared(response, 200, { ok: true });
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

export function createRuntimeAuthApi(config, env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
  return createAuthApi({
    newClient: () => createClient(url, key, options),
    verify: createLoginVerifier({ config, supabaseSecretKey: key }),
    // A dedicated client that never signs anyone in, so it always acts with the server key.
    devices: createDeviceApprovalStore(createClient(url, key, options)),
  });
}
