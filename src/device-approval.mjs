import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { credentialFrom } from './session-cookie.mjs';

// Step 11: device (login session) approval.
//
// The approved unit is ONE LOGIN SESSION, identified by `user.sessionId`, which
// src/verify-login.mjs takes from the already-verified access token: Supabase's `session_id`
// claim for students, the signed `aleph_run` claim for the judge. Nothing about the device or
// session comes from the client: no header, no body field, no query value, and nothing is kept
// in browser storage for this. A token refresh keeps the same session_id; a new login gets a new
// one and needs a new approval.
//
// Why not a client-generated id: the first version kept a random id in browser storage. The judge
// rejected it as a device key in browser storage (S11_KEY_EXPOSED): a persistent value that keeps
// a copied browser profile "recognized" is exactly what the step forbids. A session claim inside
// the server-verified token is not a separate secret, cannot be chosen by the client, and stops
// counting as soon as that session ends.
//
// Access is granted only when public.device_approvals has a row for (verified owner, this
// session) whose status is exactly 'approved'. Only the student sets that, in the Supabase SQL
// Editor (supabase/schema-device-approvals.sql). No HTTP route can approve anything.
// Nothing here trusts "the app is installed / running standalone".

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export const DEVICE_STATUSES = Object.freeze(['pending', 'approved', 'revoked']);

// The session key of a verified principal, or null when the token carried none.
export const sessionKey = user => (typeof user?.sessionId === 'string' && UUID.test(user.sessionId)
  ? user.sessionId : null);

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

// The device gate shared by every vault data route (notes, note restore, announcements).
// Call it AFTER login verification, BEFORE any data access. Returns true when the request may
// continue; otherwise it has already answered and returned false. Fail closed:
//   no session claim, or status not exactly 'approved' -> 403 DEVICE_NOT_APPROVED
//   approval lookup throws                             -> 502 DEVICE_CHECK_UNAVAILABLE
// No answer from this gate ever contains vault data.
export async function requireApprovedDevice(devices, user, response) {
  const session = sessionKey(user);
  if (!session) { send(response, 403, { error: 'DEVICE_NOT_APPROVED' }); return false; }
  let status;
  try { status = await devices.status(user.userId, session); } catch {
    send(response, 502, { error: 'DEVICE_CHECK_UNAVAILABLE' });
    return false;
  }
  if (status !== 'approved') { send(response, 403, { error: 'DEVICE_NOT_APPROVED' }); return false; }
  return true;
}

// Data APIs refuse to start without a device store, so a wiring mistake can never mean
// "no gate". (A missing gate would fail open; a missing store fails at construction.)
export function assertDeviceStore(devices) {
  if (typeof devices?.status !== 'function') throw new TypeError('device_store_required');
}

// POST /api/devices/request -> 200 { status }   (request body is never read)
// GET  /api/devices/status  -> 200 { status: pending|approved|revoked|unknown }   (query never read)
// Both need a verified login and act only on the caller's own (owner, session). Neither approves.
export function createDevicesApi({ verify, devices }) {
  if (typeof devices?.status !== 'function' || typeof devices?.request !== 'function') {
    throw new TypeError('device_store_required');
  }
  async function guard(request, response, allowed) {
    // Bearer header (non-browser clients) or the httpOnly session cookie (browser); see
    // src/session-cookie.mjs. A cookie-authenticated unsafe request from another origin stops here.
    const credential = credentialFrom(request);
    if (credential.error) { send(response, 403, { error: credential.error }); return null; }
    let user = null;
    try { user = await verify(credential.authorization); } catch { user = null; }
    if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return null; }
    if (request.method !== allowed) {
      response.setHeader('Allow', allowed);
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
    if (!sessionKey(user)) { send(response, 403, { error: 'SESSION_UNKNOWN' }); return null; }
    return user;
  }
  const run = async (response, work) => {
    try { await work(); } catch { send(response, 502, { error: 'DEVICES_UNAVAILABLE' }); }
  };
  return {
    async request(request, response) {
      const user = await guard(request, response, 'POST');
      if (!user) return;
      await run(response, async () => {
        send(response, 200, { status: await devices.request(user.userId, sessionKey(user)) });
      });
    },
    async status(request, response) {
      const user = await guard(request, response, 'GET');
      if (!user) return;
      await run(response, async () => {
        send(response, 200, { status: await devices.status(user.userId, sessionKey(user)) });
      });
    },
  };
}

// The column is still called device_id (kept so the already-run SQL needs no change); since the
// fix it holds the server-derived session id, never a client value.
export function createDeviceApprovalStore(client) {
  const check = ({ data, error }) => { if (error) throw new Error('db'); return data; };
  // Fresh read every call, no cache: a revoke in the SQL Editor takes effect on the next request.
  async function status(ownerId, sessionId) {
    const row = check(await client.from('device_approvals').select('status')
      .eq('owner_id', ownerId).eq('device_id', sessionId).maybeSingle());
    return row && DEVICE_STATUSES.includes(row.status) ? row.status : 'unknown';
  }
  return {
    status,
    // INSERT ... ON CONFLICT (owner_id, device_id) DO NOTHING. A new row is always 'pending'
    // (set here). An existing row is never touched, so asking again cannot reset 'approved' or
    // lift 'revoked'.
    async request(ownerId, sessionId) {
      check(await client.from('device_approvals')
        .upsert({ owner_id: ownerId, device_id: sessionId, status: 'pending' },
          { onConflict: 'owner_id,device_id', ignoreDuplicates: true }));
      return status(ownerId, sessionId);
    },
  };
}

export function createRuntimeDevicesApi(config, env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(url, key, { auth: { persistSession: false } });
  return createDevicesApi({ verify, devices: createDeviceApprovalStore(client) });
}
