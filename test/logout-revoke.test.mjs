// Step 12 regression: a token of a logged-out session must not keep opening vault data.
// Before this fix, logout ended the Supabase session but left the session's device_approvals row
// 'approved'. The data routes check the token signature (getClaims can do that locally, without
// asking whether the session still exists) and then the approval row, so the old token kept
// working until it expired. Step 11's tests never tried reusing a token after logout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthApi } from '../src/auth-api.mjs';
import { createDeviceApprovalStore } from '../src/device-approval.mjs';
import { createNotesApi } from '../src/notes-api.mjs';
import { fakeDeviceDb } from './fake-device-db.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SA = '5a5a5a5a-0000-4000-8000-00000000000a';
const SA2 = '5a5a5a5a-0000-4000-8000-00000000002a';
const JWT_A = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
const JWT_A2 = 'dddddddddd.eeeeeeeeee.ffffffffff';
const JWT_NEVER = 'gggggggggg.hhhhhhhhhh.iiiiiiiiii';

// Like getClaims with local JWKS verification: the signature stays valid after logout, so the
// verifier keeps returning the principal. Only the approval row can stop the old token.
const PRINCIPALS = {
  [`Bearer ${JWT_A}`]: { userId: A, sessionId: SA },
  [`Bearer ${JWT_A2}`]: { userId: A, sessionId: SA2 },
  [`Bearer ${JWT_NEVER}`]: { userId: A, sessionId: '5a5a5a5a-0000-4000-8000-00000000003a' },
};
const verify = async authorization => PRINCIPALS[authorization] ?? null;

function call(handler, { method = 'GET', action, authorization, body } = {}) {
  return new Promise(resolve => {
    const headers = new Map();
    const request = { method, query: action ? { action } : {}, body,
      headers: authorization ? { authorization } : {} };
    const response = {
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers }) }; },
    };
    handler(request, response);
  });
}

function setup({ revokeFails = false } = {}) {
  const db = fakeDeviceDb();
  const devices = createDeviceApprovalStore(db);
  const signOuts = [];
  const authDevices = revokeFails ? { ...devices, revokeAllApproved: async () => { throw new Error('down'); } } : devices;
  const auth = createAuthApi({
    verify, devices: authDevices,
    newClient: () => ({ auth: { admin: { signOut: async jwt => { signOuts.push(jwt); return { error: null }; } } } }),
  });
  const notes = [{ id: '00000000-0000-4000-8000-000000000001', title: 't', body: 'b' }];
  const store = { list: async () => notes, create: async () => 'x', get: async () => null,
    update: async () => null, remove: async () => false };
  const api = createNotesApi({ verify, store, devices });
  return { db, devices, auth, api, signOuts };
}

test('12단계: 로그아웃한 세션의 토큰으로 다시 자료를 요청하면 403이다 (회수된 신원 재시도)', async () => {
  const { db, devices, auth, api, signOuts } = setup();
  await devices.request(A, SA);
  db.setStatus(A, SA, 'approved');
  assert.equal((await call(api.collection, { authorization: `Bearer ${JWT_A}` })).status, 200);

  const out = await call(auth, { method: 'POST', action: 'logout', authorization: `Bearer ${JWT_A}` });
  assert.deepEqual([out.status, out.body], [200, { ok: true }]);
  assert.deepEqual(signOuts, [JWT_A]);
  assert.equal(db.rows.find(r => r.device_id === SA).status, 'revoked');

  const retry = await call(api.collection, { authorization: `Bearer ${JWT_A}` });
  assert.deepEqual([retry.status, retry.body], [403, { error: 'DEVICE_NOT_APPROVED' }]);
  // Asking for approval again cannot lift the revoke.
  assert.equal(await devices.request(A, SA), 'revoked');
  assert.equal((await call(api.collection, { authorization: `Bearer ${JWT_A}` })).status, 403);
});

test('12단계: 로그아웃은 전체 세션 종료(global)에 맞춰 그 사용자의 승인 행을 모두 회수하고, 다른 사용자·대기 행은 건드리지 않는다', async () => {
  const { db, devices, auth, api } = setup();
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SB = '5b5b5b5b-0000-4000-8000-00000000000b';
  const SA3 = '5a5a5a5a-0000-4000-8000-00000000004a';
  for (const [owner, session, status] of [[A, SA, 'approved'], [A, SA2, 'approved'], [A, SA3, 'pending'], [B, SB, 'approved']]) {
    await devices.request(owner, session);
    db.setStatus(owner, session, status);
  }
  await call(auth, { method: 'POST', action: 'logout', authorization: `Bearer ${JWT_A2}` });
  assert.deepEqual(db.rows.map(r => [r.owner_id, r.device_id, r.status]),
    [[A, SA, 'revoked'], [A, SA2, 'revoked'], [A, SA3, 'pending'], [B, SB, 'approved']]);
  // The OTHER device's still-unexpired token (session SA) is now refused too.
  assert.equal((await call(api.collection, { authorization: `Bearer ${JWT_A}` })).status, 403);

  const never = await call(auth, { method: 'POST', action: 'logout', authorization: `Bearer ${JWT_NEVER}` });
  assert.deepEqual([never.status, never.body], [200, { ok: true }]);
  assert.equal(db.rows.length, 4); // logout never creates rows
});

test('12단계: 회수에 실패하면 깨끗한 로그아웃이라 답하지 않고 502, 세션 종료와 쿠키 삭제는 그대로 한다', async () => {
  const { auth, signOuts } = setup({ revokeFails: true });
  const errors = [];
  const original = console.error;
  console.error = line => errors.push(line);
  try {
    const out = await call(auth, { method: 'POST', action: 'logout', authorization: `Bearer ${JWT_A}` });
    assert.deepEqual([out.status, out.body], [502, { error: 'LOGOUT_REVOKE_FAILED' }]);
    assert.equal(out.headers.get('set-cookie').length, 2);
  } finally {
    console.error = original;
  }
  assert.deepEqual(signOuts, [JWT_A]);
  assert.deepEqual(errors, ['logout: device approval revoke failed']);
});

test('12단계: SQL Editor에서 회수하면 아직 유효한 토큰이라도 바로 다음 요청부터 403이다 (캐시 없음)', async () => {
  const { db, devices, api } = setup();
  await devices.request(A, SA);
  db.setStatus(A, SA, 'approved');
  const before = db.calls.filter(c => c.op === 'select').length;
  assert.equal((await call(api.collection, { authorization: `Bearer ${JWT_A}` })).status, 200);
  db.setStatus(A, SA, 'revoked');
  assert.equal((await call(api.collection, { authorization: `Bearer ${JWT_A}` })).status, 403);
  const reads = db.calls.filter(c => c.op === 'select').length - before;
  assert.equal(reads, 2); // one fresh approval read per request, nothing cached
});

test('12단계: 회수 수단 없이 로그인 API를 만들 수 없다 (연결 실수로 회수가 빠지지 않게)', () => {
  assert.throws(() => createAuthApi({ newClient: () => ({}) }), /logout_revocation_required/u);
  assert.throws(() => createAuthApi({ newClient: () => ({}), verify, devices: {} }), /logout_revocation_required/u);
});
