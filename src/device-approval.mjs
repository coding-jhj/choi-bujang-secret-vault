import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

// Step 11: device approval.
//
// A "device id" is an opaque, NON-SECRET label the browser generates once (crypto.randomUUID())
// and sends with every vault request in the X-Device-Id header. It is not a key and not a token:
// knowing it grants nothing. Access is granted only when the SERVER finds, in
// public.device_approvals, a row for (verified owner, this device id) whose status is exactly
// 'approved'. That row is changed to 'approved' only by the student in the Supabase SQL Editor
// (see supabase/schema-device-approvals.sql); no HTTP route can approve a device.
//
// What this does NOT prove: the device id is readable by anything that can read the browser's
// storage, so it is an approval label, not proof that the request came from that machine. Real
// device binding needs a non-extractable key and a signed challenge, which this step does not add.
//
// Nothing here trusts "the app is installed / running standalone" (display-mode, manifest,
// user agent). Only the server-side approval row decides.

export const DEVICE_HEADER = 'x-device-id';
// crypto.randomUUID() fits; also any other 16-128 char token of letters, digits, '_' and '-'.
const DEVICE_ID = /^[A-Za-z0-9_-]{16,128}$/u;
export const DEVICE_STATUSES = Object.freeze(['pending', 'approved', 'revoked']);

export const validDeviceId = value => typeof value === 'string' && DEVICE_ID.test(value);

// Reads the device id from request headers. Missing, repeated (Node joins duplicates into one
// string with ', ', which fails the pattern), wrong-typed or malformed -> null.
export function readDeviceId(headers) {
  const value = headers?.[DEVICE_HEADER];
  return validDeviceId(value) ? value : null;
}

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

// The device gate shared by every vault data route (notes, note restore, announcements).
// Call it AFTER login verification, BEFORE any data access. Returns true when the request may
// continue; otherwise it has already answered and returned false. Fail closed:
//   no / malformed X-Device-Id   -> 403 DEVICE_ID_REQUIRED
//   status not exactly approved  -> 403 DEVICE_NOT_APPROVED (pending, revoked, unknown)
//   approval lookup throws       -> 502 DEVICE_CHECK_UNAVAILABLE
// No answer from this gate ever contains vault data.
export async function requireApprovedDevice(devices, user, request, response) {
  const deviceId = readDeviceId(request.headers);
  if (!deviceId) { send(response, 403, { error: 'DEVICE_ID_REQUIRED' }); return false; }
  let status;
  try { status = await devices.status(user.userId, deviceId); } catch {
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

function readRequestBody(request) {
  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  // Only deviceId is read. Any other field (status, approved, owner_id, ...) is ignored.
  return validDeviceId(body.deviceId) ? body.deviceId : null;
}

// POST /api/devices/request  body { deviceId }  -> 200 { status }
// GET  /api/devices/status?deviceId=...         -> 200 { status: pending|approved|revoked|unknown }
// Both need a verified login. Both are scoped to the verified user; the owner never comes from
// the request. Neither route can approve anything.
export function createDevicesApi({ verify, devices }) {
  if (typeof devices?.status !== 'function' || typeof devices?.request !== 'function') {
    throw new TypeError('device_store_required');
  }
  async function guard(request, response, allowed) {
    let user = null;
    try { user = await verify(request.headers?.authorization); } catch { user = null; }
    if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return null; }
    if (request.method !== allowed) {
      response.setHeader('Allow', allowed);
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
    return user;
  }
  const run = async (response, work) => {
    try { await work(); } catch { send(response, 502, { error: 'DEVICES_UNAVAILABLE' }); }
  };
  return {
    async request(request, response) {
      const user = await guard(request, response, 'POST');
      if (!user) return;
      const deviceId = readRequestBody(request);
      if (!deviceId) { send(response, 400, { error: 'INVALID_DEVICE_ID' }); return; }
      await run(response, async () => {
        send(response, 200, { status: await devices.request(user.userId, deviceId) });
      });
    },
    async status(request, response) {
      const user = await guard(request, response, 'GET');
      if (!user) return;
      const deviceId = request.query?.deviceId;
      if (!validDeviceId(deviceId)) { send(response, 400, { error: 'INVALID_DEVICE_ID' }); return; }
      await run(response, async () => {
        send(response, 200, { status: await devices.status(user.userId, deviceId) });
      });
    },
  };
}

export function createDeviceApprovalStore(client) {
  const check = ({ data, error }) => { if (error) throw new Error('db'); return data; };
  // Fresh read every call, no cache: a revoke in the SQL Editor takes effect on the next request.
  async function status(ownerId, deviceId) {
    const row = check(await client.from('device_approvals').select('status')
      .eq('owner_id', ownerId).eq('device_id', deviceId).maybeSingle());
    return row && DEVICE_STATUSES.includes(row.status) ? row.status : 'unknown';
  }
  return {
    status,
    // INSERT ... ON CONFLICT (owner_id, device_id) DO NOTHING. A new row is always 'pending'
    // (set here, not taken from the request). An existing row is never touched, so asking again
    // cannot reset 'approved' or lift 'revoked'.
    async request(ownerId, deviceId) {
      check(await client.from('device_approvals')
        .upsert({ owner_id: ownerId, device_id: deviceId, status: 'pending' },
          { onConflict: 'owner_id,device_id', ignoreDuplicates: true }));
      return status(ownerId, deviceId);
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
