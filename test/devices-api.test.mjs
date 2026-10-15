import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnnouncementsApi } from '../src/announcements-api.mjs';
import { createDeviceApprovalStore, createDevicesApi } from '../src/device-approval.mjs';
import { fakeDeviceDb } from './fake-device-db.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Session ids as src/verify-login.mjs derives them from the verified token's own claims.
const SA = '5a5a5a5a-0000-4000-8000-00000000000a';   // A, first login
const SA2 = '5a5a5a5a-0000-4000-8000-00000000002a';  // A, a later fresh login
const SB = '5b5b5b5b-0000-4000-8000-00000000000b';

const PRINCIPALS = {
  'Bearer user-a': { userId: A, sessionId: SA },
  'Bearer user-a-refreshed': { userId: A, sessionId: SA }, // new access token, same session
  'Bearer user-a-relogin': { userId: A, sessionId: SA2 },
  'Bearer user-b': { userId: B, sessionId: SB },
  'Bearer user-a-no-session': { userId: A, sessionId: null },
};
const verify = async authorization => PRINCIPALS[authorization] ?? null;

function call(handler, { method = 'GET', token, body, query, headers: extra } = {}) {
  return new Promise(resolve => {
    const headers = new Map();
    const requestHeaders = { ...extra };
    if (token) requestHeaders.authorization = `Bearer ${token}`;
    const request = { method, query, body, headers: requestHeaders };
    const response = {
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers }) }; },
    };
    handler(request, response);
  });
}

const setup = (options = {}) => {
  const db = fakeDeviceDb(options);
  return { db, api: createDevicesApi({ verify, devices: createDeviceApprovalStore(db) }) };
};
const rows = db => db.rows.map(r => [r.owner_id, r.device_id, r.status]);

test('11단계: 승인 요청은 토큰의 세션으로 pending 행을 만들고, 반복해도 한 행이다', async () => {
  const { db, api } = setup();
  const first = await call(api.request, { method: 'POST', token: 'user-a' });
  assert.deepEqual([first.status, first.body], [200, { status: 'pending' }]);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-a', body: '{}' })).body, { status: 'pending' });
  assert.deepEqual(rows(db), [[A, SA, 'pending']]);
});

test('11단계: 본문·쿼리·헤더의 어떤 값도 승인 상태나 세션을 바꾸지 못한다 (본문 위조)', async () => {
  const { db, api } = setup();
  const forged = await call(api.request, { method: 'POST', token: 'user-a',
    body: { deviceId: SB, sessionId: SB, status: 'approved', approved: true, owner_id: B },
    query: { deviceId: SB, status: 'approved' }, headers: { 'x-device-id': SB, 'x-session-id': SB } });
  assert.deepEqual([forged.status, forged.body], [200, { status: 'pending' }]);
  assert.deepEqual(rows(db), [[A, SA, 'pending']]);
  const upsert = db.calls.find(c => c.op === 'upsert');
  assert.deepEqual(upsert.payload, { owner_id: A, device_id: SA, status: 'pending' });
  assert.deepEqual(upsert.options, { onConflict: 'owner_id,device_id', ignoreDuplicates: true });
  const status = await call(api.status, { token: 'user-a', query: { deviceId: SB, status: 'approved' }, headers: { 'x-device-id': SB } });
  assert.deepEqual(status.body, { status: 'pending' });
});

test('11단계: 상태는 매번 DB 값이고, 토큰 갱신은 같은 승인·새 로그인은 새 승인이 필요하다', async () => {
  const { db, api } = setup();
  assert.deepEqual((await call(api.status, { token: 'user-a' })).body, { status: 'unknown' });
  await call(api.request, { method: 'POST', token: 'user-a' });
  db.setStatus(A, SA, 'approved');
  assert.deepEqual((await call(api.status, { token: 'user-a' })).body, { status: 'approved' });
  assert.deepEqual((await call(api.status, { token: 'user-a-refreshed' })).body, { status: 'approved' });
  assert.deepEqual((await call(api.status, { token: 'user-a-relogin' })).body, { status: 'unknown' });
  // Asking again must not reset approved, nor lift a revoke.
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-a' })).body, { status: 'approved' });
  db.setStatus(A, SA, 'revoked');
  assert.deepEqual((await call(api.status, { token: 'user-a' })).body, { status: 'revoked' });
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-a' })).body, { status: 'revoked' });
  db.rows[0].status = 'approved ';
  assert.deepEqual((await call(api.status, { token: 'user-a' })).body, { status: 'unknown' });
});

test('11단계: 다른 사용자의 승인은 보이지도, 쓰이지도 않는다 (소유자 범위)', async () => {
  const { db, api } = setup();
  await call(api.request, { method: 'POST', token: 'user-a' });
  db.setStatus(A, SA, 'approved');
  assert.deepEqual((await call(api.status, { token: 'user-b' })).body, { status: 'unknown' });
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-b' })).body, { status: 'pending' });
  assert.deepEqual(rows(db), [[A, SA, 'approved'], [B, SB, 'pending']]);
});

test('11단계: 로그인 없음·방법 오류·세션 없는 토큰·DB 오류를 거부한다', async () => {
  const { db, api } = setup();
  for (const [handler, method] of [[api.request, 'POST'], [api.status, 'GET']]) {
    const result = await call(handler, { method, body: { status: 'approved' } });
    assert.deepEqual([result.status, result.body], [401, { error: 'LOGIN_REQUIRED' }]);
    assert.equal((await call(handler, { method, token: 'forged' })).status, 401);
    const noSession = await call(handler, { method, token: 'user-a-no-session' });
    assert.deepEqual([noSession.status, noSession.body], [403, { error: 'SESSION_UNKNOWN' }]);
  }
  assert.equal(db.rows.length, 0);
  assert.equal((await call(api.request, { method: 'GET', token: 'user-a' })).status, 405);
  assert.equal((await call(api.status, { method: 'POST', token: 'user-a' })).status, 405);
  const down = setup({ fail: true }).api;
  const failed = await call(down.request, { method: 'POST', token: 'user-a' });
  assert.deepEqual([failed.status, failed.body], [502, { error: 'DEVICES_UNAVAILABLE' }]);
});

// Announcements are vault data too: same gate.
function announcementStore() {
  const list = [{ id: '00000000-0000-4000-8000-000000000001', owner: A, title: 'A 공지', body: 'A 공지 내용' }];
  let reads = 0;
  return {
    get reads() { return reads; },
    async list(owner) { reads += 1; return list.filter(r => r.owner === owner).map(({ owner: _o, ...n }) => n); },
    async create() { reads += 1; return 'x'; },
    async get(owner, id) { reads += 1; const r = list.find(x => x.id === id && x.owner === owner); return r ? { id: r.id, title: r.title, body: r.body } : null; },
    async update() { reads += 1; return null; },
    async remove() { reads += 1; return false; },
  };
}

test('11단계: 공지도 승인된 로그인 세션에서만 열리고, 그 전에는 저장소를 읽지 않는다', async () => {
  const db = fakeDeviceDb();
  const devices = createDeviceApprovalStore(db);
  const store = announcementStore();
  const api = createAnnouncementsApi({ verify, store, devices });
  const id = '00000000-0000-4000-8000-000000000001';
  for (const token of ['user-a', 'user-a-no-session']) {
    const list = await call(api.collection, { token });
    assert.deepEqual([list.status, list.body], [403, { error: 'DEVICE_NOT_APPROVED' }]);
    const item = await call(api.item, { token, query: { id } });
    assert.deepEqual([item.status, item.body], [403, { error: 'DEVICE_NOT_APPROVED' }]);
  }
  await devices.request(A, SA);
  assert.equal((await call(api.collection, { token: 'user-a' })).status, 403);
  assert.equal(store.reads, 0);
  db.setStatus(A, SA, 'approved');
  const ok = await call(api.collection, { token: 'user-a' });
  assert.deepEqual([ok.status, ok.body], [200, [{ id, title: 'A 공지', body: 'A 공지 내용' }]]);
  assert.equal((await call(api.collection, { token: 'user-a-refreshed' })).status, 200);
  assert.equal((await call(api.collection, { token: 'user-a-relogin' })).status, 403);
  assert.equal((await call(api.collection, { token: 'user-b' })).status, 403);
  assert.throws(() => createAnnouncementsApi({ verify, store }), /device_store_required/u);
});
