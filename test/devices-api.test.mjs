import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnnouncementsApi } from '../src/announcements-api.mjs';
import { createDeviceApprovalStore, createDevicesApi, readDeviceId } from '../src/device-approval.mjs';
import { fakeDeviceDb } from './fake-device-db.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEV = '11111111-2222-4333-8444-555555555555';
const DEV2 = '66666666-7777-4888-8999-000000000000';

const verify = async authorization => {
  if (authorization === 'Bearer user-a') return { userId: A };
  if (authorization === 'Bearer user-b') return { userId: B };
  return null;
};

function call(handler, { method = 'GET', token, body, query, device } = {}) {
  return new Promise(resolve => {
    const headers = new Map();
    const requestHeaders = {};
    if (token) requestHeaders.authorization = `Bearer ${token}`;
    if (device !== undefined) requestHeaders['x-device-id'] = device;
    const request = { method, query, body, headers: requestHeaders };
    const response = {
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers }) }; },
    };
    handler(request, response);
  });
}

const setup = options => {
  const db = fakeDeviceDb(options);
  return { db, api: createDevicesApi({ verify, devices: createDeviceApprovalStore(db) }) };
};

test('11단계: 승인 요청은 pending 행을 만들고, 같은 요청을 반복해도 한 행이다', async () => {
  const { db, api } = setup();
  const first = await call(api.request, { method: 'POST', token: 'user-a', body: { deviceId: DEV } });
  assert.deepEqual([first.status, first.body], [200, { status: 'pending' }]);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const again = await call(api.request, { method: 'POST', token: 'user-a', body: JSON.stringify({ deviceId: DEV }) });
  assert.deepEqual([again.status, again.body], [200, { status: 'pending' }]);
  assert.equal(db.rows.length, 1);
  assert.deepEqual({ owner_id: db.rows[0].owner_id, device_id: db.rows[0].device_id, status: db.rows[0].status },
    { owner_id: A, device_id: DEV, status: 'pending' });
});

test('11단계: 본문에 status·owner_id를 넣어도 무시되고 언제나 pending으로 시작한다 (본문 위조)', async () => {
  const { db, api } = setup();
  const forged = await call(api.request, { method: 'POST', token: 'user-a',
    body: { deviceId: DEV, status: 'approved', approved: true, owner_id: B, approved_at: '2026-01-01T00:00:00Z' } });
  assert.deepEqual([forged.status, forged.body], [200, { status: 'pending' }]);
  assert.equal(db.rows.length, 1);
  assert.deepEqual([db.rows[0].owner_id, db.rows[0].status, db.rows[0].approved_at], [A, 'pending', undefined]);
  // The store wrote only these three columns, whatever the body contained.
  const upsert = db.calls.find(c => c.op === 'upsert');
  assert.deepEqual(upsert.payload, { owner_id: A, device_id: DEV, status: 'pending' });
  assert.deepEqual(upsert.options, { onConflict: 'owner_id,device_id', ignoreDuplicates: true });
  const status = await call(api.status, { token: 'user-a', query: { deviceId: DEV, status: 'approved' } });
  assert.deepEqual(status.body, { status: 'pending' });
});

test('11단계: 상태 조회는 매번 DB의 현재 값이다 (승인·회수가 바로 보인다)', async () => {
  const { db, api } = setup();
  assert.deepEqual((await call(api.status, { token: 'user-a', query: { deviceId: DEV } })).body, { status: 'unknown' });
  await call(api.request, { method: 'POST', token: 'user-a', body: { deviceId: DEV } });
  db.setStatus(A, DEV, 'approved');
  assert.deepEqual((await call(api.status, { token: 'user-a', query: { deviceId: DEV } })).body, { status: 'approved' });
  // Asking again must not reset an approved device to pending.
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-a', body: { deviceId: DEV } })).body, { status: 'approved' });
  db.setStatus(A, DEV, 'revoked');
  assert.deepEqual((await call(api.status, { token: 'user-a', query: { deviceId: DEV } })).body, { status: 'revoked' });
  // Asking again must not lift a revoke either.
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-a', body: { deviceId: DEV } })).body, { status: 'revoked' });
  // A status value outside the three known ones is reported as unknown, never passed through.
  db.rows[0].status = 'approved ';
  assert.deepEqual((await call(api.status, { token: 'user-a', query: { deviceId: DEV } })).body, { status: 'unknown' });
});

test('11단계: 다른 사용자의 기기 승인은 보이지도, 쓰이지도 않는다 (소유자 범위)', async () => {
  const { db, api } = setup();
  await call(api.request, { method: 'POST', token: 'user-a', body: { deviceId: DEV } });
  db.setStatus(A, DEV, 'approved');
  // B asks about A's approved device id: B has no row for it.
  assert.deepEqual((await call(api.status, { token: 'user-b', query: { deviceId: DEV } })).body, { status: 'unknown' });
  // B requesting the same device id creates B's own pending row; A's approved row is untouched.
  assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-b', body: { deviceId: DEV } })).body, { status: 'pending' });
  assert.deepEqual(db.rows.map(r => [r.owner_id, r.device_id, r.status]), [[A, DEV, 'approved'], [B, DEV, 'pending']]);
  assert.deepEqual((await call(api.status, { token: 'user-a', query: { deviceId: DEV } })).body, { status: 'approved' });
});

test('11단계: 기기 경로도 로그인·방법·입력 형식을 거부하고, DB 오류는 내용 없이 502다', async () => {
  const { api } = setup();
  for (const [handler, method] of [[api.request, 'POST'], [api.status, 'GET']]) {
    const result = await call(handler, { method, body: { deviceId: DEV }, query: { deviceId: DEV } });
    assert.deepEqual([result.status, result.body], [401, { error: 'LOGIN_REQUIRED' }]);
    assert.equal((await call(handler, { method, token: 'forged', body: { deviceId: DEV }, query: { deviceId: DEV } })).status, 401);
  }
  assert.equal((await call(api.request, { method: 'GET', token: 'user-a' })).status, 405);
  assert.equal((await call(api.status, { method: 'POST', token: 'user-a', query: { deviceId: DEV } })).status, 405);
  for (const body of [null, {}, [], 'not json', { deviceId: 1 }, { deviceId: 'short' }, { deviceId: 'x'.repeat(129) },
    { deviceId: 'has space in it 1234' }, { deviceId: `${DEV}, ${DEV2}` }]) {
    assert.deepEqual((await call(api.request, { method: 'POST', token: 'user-a', body })).body, { error: 'INVALID_DEVICE_ID' });
  }
  for (const query of [undefined, {}, { deviceId: ['a'.repeat(20)] }, { deviceId: 'bad id!' }]) {
    assert.equal((await call(api.status, { token: 'user-a', query })).status, 400);
  }
  const down = setup({ fail: true }).api;
  const failed = await call(down.request, { method: 'POST', token: 'user-a', body: { deviceId: DEV } });
  assert.deepEqual([failed.status, failed.body], [502, { error: 'DEVICES_UNAVAILABLE' }]);
});

test('11단계: X-Device-Id 헤더는 한 개의 올바른 형식 값만 읽는다', () => {
  assert.equal(readDeviceId({ 'x-device-id': DEV }), DEV);
  for (const headers of [undefined, {}, { 'x-device-id': '' }, { 'x-device-id': `${DEV}, ${DEV2}` },
    { 'x-device-id': [DEV] }, { 'x-device-id': 'short' }, { 'X-Device-Id': DEV }]) {
    assert.equal(readDeviceId(headers), null);
  }
});

// Announcements are vault data too: same gate.
function announcementStore() {
  const rows = [{ id: '00000000-0000-4000-8000-000000000001', owner: A, title: 'A 공지', body: 'A 공지 내용' }];
  let reads = 0;
  return {
    get reads() { return reads; },
    async list(owner) { reads += 1; return rows.filter(r => r.owner === owner).map(({ owner: _o, ...n }) => n); },
    async create() { reads += 1; return 'x'; },
    async get(owner, id) { reads += 1; const r = rows.find(x => x.id === id && x.owner === owner); return r ? { id: r.id, title: r.title, body: r.body } : null; },
    async update() { reads += 1; return null; },
    async remove() { reads += 1; return false; },
  };
}

test('11단계: 공지도 승인된 기기에서만 열리고, 그 전에는 저장소를 읽지 않는다', async () => {
  const db = fakeDeviceDb();
  const devices = createDeviceApprovalStore(db);
  const store = announcementStore();
  const api = createAnnouncementsApi({ verify, store, devices });
  const denied = [
    [undefined, 'DEVICE_ID_REQUIRED'],
    [DEV, 'DEVICE_NOT_APPROVED'],
  ];
  for (const [device, error] of denied) {
    const list = await call(api.collection, { token: 'user-a', device });
    assert.deepEqual([list.status, list.body], [403, { error }]);
    const item = await call(api.item, { token: 'user-a', device, query: { id: '00000000-0000-4000-8000-000000000001' } });
    assert.deepEqual([item.status, item.body], [403, { error }]);
  }
  await devices.request(A, DEV);
  assert.equal((await call(api.collection, { token: 'user-a', device: DEV })).status, 403);
  assert.equal(store.reads, 0);
  db.setStatus(A, DEV, 'approved');
  const ok = await call(api.collection, { token: 'user-a', device: DEV });
  assert.deepEqual([ok.status, ok.body], [200, [{ id: '00000000-0000-4000-8000-000000000001', title: 'A 공지', body: 'A 공지 내용' }]]);
  // A's approved device id does not work for B.
  assert.equal((await call(api.collection, { token: 'user-b', device: DEV })).status, 403);
  assert.throws(() => createAnnouncementsApi({ verify, store }), /device_store_required/u);
});
