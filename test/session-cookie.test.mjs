import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCESS_COOKIE, clearedCookies, credentialFrom, isSameOrigin, readCookie,
  sessionCookies } from '../src/session-cookie.mjs';
import { createNotesApi } from '../src/notes-api.mjs';
import { createNotesRestoreApi } from '../src/notes-restore-api.mjs';
import { createAnnouncementsApi } from '../src/announcements-api.mjs';
import { createDeviceApprovalStore, createDevicesApi } from '../src/device-approval.mjs';
import { fakeDeviceDb } from './fake-device-db.mjs';

// Step 11 fix 2 (S11_KEY_EXPOSED): the browser authenticates with an httpOnly cookie instead of
// a token kept in sessionStorage. These tests pin the cookie reader, the CSRF rule, and that every
// data route accepts the cookie for a same-origin request and refuses it for a cross-site one.

const HOST = 'vault.example.vercel.app';
const SAME = { host: HOST, origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' };
const CROSS = { host: HOST, origin: 'https://evil.vercel.app', 'sec-fetch-site': 'cross-site' };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SA = '5a5a5a5a-0000-4000-8000-00000000000a';
const JWT_A = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
const JWT_B = 'dddddddddd.eeeeeeeeee.ffffffffff';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SB = '5b5b5b5b-0000-4000-8000-00000000000b';

// The verifier is the same function the Bearer path uses; it only ever sees `Bearer <jwt>`.
const seen = [];
const verify = async authorization => {
  seen.push(authorization);
  if (authorization === `Bearer ${JWT_A}`) return { userId: A, sessionId: SA };
  if (authorization === `Bearer ${JWT_B}`) return { userId: B, sessionId: SB };
  return null;
};
const devices = { status: async () => 'approved' };
const cookieA = `${ACCESS_COOKIE}=${JWT_A}`;

function call(handler, { method = 'GET', headers = {}, body, query } = {}) {
  return new Promise(resolve => {
    const out = new Map();
    handler({ method, headers, body, query }, {
      setHeader: (k, v) => out.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers: out }) }; },
    });
  });
}

// A store that records every call, so a refused request can be shown to have touched nothing.
function recordingStore() {
  const calls = [];
  const handler = { get: (_t, op) => async (...args) => { calls.push(op); return op === 'list' ? [] : 'x'; } };
  return { calls, store: new Proxy({}, handler) };
}

test('쿠키 읽기: 이름이 정확히 같은 한 개만, 허용 문자만 받는다 (중복·이상한 값은 없는 것으로)', () => {
  const req = cookie => ({ headers: { cookie } });
  assert.equal(readCookie(req(`a=1; ${cookieA}; b=2`), ACCESS_COOKIE), JWT_A);
  assert.equal(readCookie(req(`${cookieA}; ${ACCESS_COOKIE}=${JWT_B}`), ACCESS_COOKIE), null);
  assert.equal(readCookie(req(`x${ACCESS_COOKIE}=${JWT_A}`), ACCESS_COOKIE), null);
  assert.equal(readCookie(req(`${ACCESS_COOKIE}=a b`), ACCESS_COOKIE), null);
  assert.equal(readCookie(req(`${ACCESS_COOKIE}=`), ACCESS_COOKIE), null);
  assert.equal(readCookie(req(`${ACCESS_COOKIE}=${'a'.repeat(8193)}`), ACCESS_COOKIE), null);
  assert.equal(readCookie({ headers: {} }, ACCESS_COOKIE), null);
});

test('같은 출처 판정: Origin이 이 호스트의 https 출처일 때만, Sec-Fetch-Site가 있으면 same-origin일 때만', () => {
  assert.equal(isSameOrigin({ headers: SAME }), true);
  assert.equal(isSameOrigin({ headers: { host: HOST, origin: `https://${HOST}` } }), true);
  assert.equal(isSameOrigin({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } }), true);
  for (const headers of [
    CROSS,
    { host: HOST },                                                    // no Origin
    { host: HOST, origin: 'null' },
    { host: HOST, origin: `http://${HOST}` },                          // downgraded scheme
    { host: HOST, origin: `https://${HOST}.evil.app` },
    { host: HOST, origin: `https://${HOST}/path` },
    { host: HOST, origin: `https://${HOST}, https://evil.vercel.app` }, // duplicated header joined
    { ...SAME, 'sec-fetch-site': 'same-site' },                        // sibling *.vercel.app
    { ...SAME, 'sec-fetch-site': 'cross-site' },
    { origin: `https://${HOST}` },                                     // no Host
  ]) assert.equal(isSameOrigin({ headers }), false, JSON.stringify(headers));
});

test('자격 증명 선택: Authorization 헤더가 있으면 그것만 쓰고 쿠키는 보지 않는다', () => {
  assert.deepEqual(credentialFrom({ method: 'POST', headers: { authorization: 'Bearer x.y.z', cookie: cookieA } }),
    { authorization: 'Bearer x.y.z' });
  assert.deepEqual(credentialFrom({ method: 'POST', headers: { authorization: '', cookie: cookieA, ...SAME } }),
    { authorization: '' });
  assert.deepEqual(credentialFrom({ method: 'GET', headers: { cookie: cookieA } }), { authorization: `Bearer ${JWT_A}` });
  assert.deepEqual(credentialFrom({ method: 'POST', headers: { cookie: cookieA, ...SAME } }), { authorization: `Bearer ${JWT_A}` });
  assert.deepEqual(credentialFrom({ method: 'GET', headers: {} }), { authorization: null });
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.deepEqual(credentialFrom({ method, headers: { cookie: cookieA } }), { error: 'CSRF_REJECTED' });
    assert.deepEqual(credentialFrom({ method, headers: { cookie: cookieA, ...CROSS } }), { error: 'CSRF_REJECTED' });
  }
});

test('쿠키 속성: HttpOnly·Secure·SameSite=Strict, 접근 쿠키 Path=/, 갱신 쿠키 Path=/api/auth, 지우기는 같은 이름·경로', () => {
  const [access, refresh] = sessionCookies({ accessToken: JWT_A, refreshToken: 'r-1' });
  assert.equal(access, `__Host-byteback_at=${JWT_A}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  assert.equal(refresh, '__Secure-byteback_rt=r-1; Path=/api/auth; HttpOnly; Secure; SameSite=Strict');
  assert.ok(!/Domain=|Max-Age|Expires/iu.test(access + refresh)); // session cookies, host-only
  const [clearA, clearR] = clearedCookies();
  assert.match(clearA, /^__Host-byteback_at=; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970/u);
  assert.match(clearR, /^__Secure-byteback_rt=; Path=\/api\/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0; /u);
  assert.equal(sessionCookies({ accessToken: 'a;b', refreshToken: 'r' }), null);    // header injection
  assert.equal(sessionCookies({ accessToken: JWT_A, refreshToken: 'r\r\nX: y' }), null);
  assert.equal(sessionCookies({ accessToken: JWT_A }), null);
  assert.equal(sessionCookies({ accessToken: JWT_A, refreshToken: 'a,b' }), null);
  assert.equal(sessionCookies({ accessToken: JWT_A, refreshToken: 'a b' }), null);
  // base64 refresh tokens (+ / =) are valid cookie values and must not lock the user out.
  assert.equal(sessionCookies({ accessToken: JWT_A, refreshToken: 'Ab+/c9==' })[1].split(';')[0],
    '__Secure-byteback_rt=Ab+/c9==');
  assert.equal(readCookie({ headers: { cookie: '__Secure-byteback_rt=Ab+/c9==' } }, '__Secure-byteback_rt'), 'Ab+/c9==');
});

test('메모: 같은 출처 쿠키로 읽기·쓰기 정상, 쿠키 없음 401, 다른 출처 쿠키 쓰기는 403이고 저장소 0회', async () => {
  const { calls, store } = recordingStore();
  const api = createNotesApi({ verify, store, devices });
  const id = '00000000-0000-4000-8000-000000000001';
  const note = { title: 't', body: 'b' };

  assert.equal((await call(api.collection, { headers: { cookie: cookieA } })).status, 200);
  assert.equal((await call(api.collection, { method: 'POST', headers: { ...SAME, cookie: cookieA }, body: note })).status, 201);
  assert.equal((await call(api.item, { method: 'DELETE', query: { id }, headers: { ...SAME, cookie: cookieA } })).status, 200);
  assert.deepEqual(calls, ['list', 'create', 'remove']);

  const none = await call(api.collection);
  assert.deepEqual([none.status, none.body], [401, { error: 'LOGIN_REQUIRED' }]);

  const before = seen.length;
  for (const [handler, method, extra] of [[api.collection, 'POST', {}], [api.item, 'PUT', { query: { id } }],
    [api.item, 'DELETE', { query: { id } }]]) {
    for (const headers of [{ ...CROSS, cookie: cookieA }, { host: HOST, cookie: cookieA }]) {
      const denied = await call(handler, { method, headers, body: note, ...extra });
      assert.deepEqual([denied.status, denied.body], [403, { error: 'CSRF_REJECTED' }]);
    }
  }
  assert.deepEqual(calls, ['list', 'create', 'remove']); // nothing more reached the store
  assert.equal(seen.length, before);                      // refused before token verification
});

test('메모: Bearer 헤더(심판·스크립트 경로)는 그대로 동작하고, 헤더가 있으면 쿠키의 다른 사용자로 바뀌지 않는다', async () => {
  const owners = [];
  const store = { list: async owner => { owners.push(owner); return []; } };
  const api = createNotesApi({ verify, store, devices });
  assert.equal((await call(api.collection, { headers: { authorization: `Bearer ${JWT_A}` } })).status, 200);
  // Header says A, cookie says B: A is used, B is never read.
  assert.equal((await call(api.collection, { headers: { authorization: `Bearer ${JWT_A}`,
    cookie: `${ACCESS_COOKIE}=${JWT_B}` } })).status, 200);
  // A broken header does not fall back to a valid cookie.
  assert.equal((await call(api.collection, { headers: { authorization: 'Bearer nope',
    cookie: cookieA } })).status, 401);
  assert.deepEqual(owners, [A, A]);
});

test('복구·공지: 다른 출처 쿠키 POST는 403·저장소 0회, 공지 목록은 쿠키로 저장소까지 간다', async () => {
  const restore = recordingStore();
  const restoreApi = createNotesRestoreApi({ verify, store: restore.store, devices });
  const id = '00000000-0000-4000-8000-000000000001';
  const denied = await call(restoreApi.item, { method: 'POST', query: { id }, headers: { ...CROSS, cookie: cookieA } });
  assert.deepEqual([denied.status, denied.body], [403, { error: 'CSRF_REJECTED' }]);
  assert.deepEqual(restore.calls, []);

  const ann = recordingStore();
  const annApi = createAnnouncementsApi({ verify, store: ann.store, devices });
  const bad = await call(annApi.collection, { method: 'POST', headers: { ...CROSS, cookie: cookieA }, body: { title: 't', body: 'b' } });
  assert.deepEqual([bad.status, bad.body], [403, { error: 'CSRF_REJECTED' }]);
  assert.deepEqual(ann.calls, []);
  assert.equal((await call(annApi.collection, { headers: { cookie: cookieA } })).status, 200);
  assert.deepEqual(ann.calls, ['list']);
});

test('기기 승인: 쿠키 로그인도 같은 세션 번호로 pending 행을 만들고, 다른 출처 요청은 행을 만들지 않는다', async () => {
  const db = fakeDeviceDb();
  const api = createDevicesApi({ verify, devices: createDeviceApprovalStore(db) });
  const denied = await call(api.request, { method: 'POST', headers: { ...CROSS, cookie: cookieA }, body: '{}' });
  assert.deepEqual([denied.status, denied.body], [403, { error: 'CSRF_REJECTED' }]);
  assert.deepEqual(db.rows, []);

  const ok = await call(api.request, { method: 'POST', headers: { ...SAME, cookie: cookieA }, body: '{}' });
  assert.deepEqual([ok.status, ok.body], [200, { status: 'pending' }]);
  assert.deepEqual(db.rows.map(r => [r.owner_id, r.device_id, r.status]), [[A, SA, 'pending']]);
  // The status read is a GET: the same cookie works without Origin (SameSite=Strict already
  // keeps it off cross-site requests), and the answer is the same session's row.
  assert.deepEqual((await call(api.status, { headers: { cookie: cookieA } })).body, { status: 'pending' });
  assert.equal((await call(api.status)).status, 401);
});

// Requirement: the step 11 device gate must work unchanged when the token arrives in a cookie.
// Real src/verify-login.mjs (only Supabase's getClaims is faked) + real device store + notes API.
const fakeJwt = claims => ['{"alg":"none"}', JSON.stringify(claims), 'sig']
  .map((part, i) => (i < 2 ? Buffer.from(part).toString('base64url') : part)).join('.');

test('기기 관문: 쿠키로 온 토큰도 실제 검증기가 session_id를 꺼내고, 승인 전 403·승인 후 200·재로그인 403', async () => {
  const { createLoginVerifier } = await import('../src/verify-login.mjs');
  const iss = 'https://abcdefgh.supabase.co/auth/v1';
  const config = { judgeIssuer: 'https://judge.up.railway.app/defense/judge',
    publicAppUrl: 'https://app-name.vercel.app',
    identityProvider: { issuer: iss, audience: 'authenticated', jwksUrl: `${iss}/.well-known/jwks.json` } };
  const claims = new Map();
  const base = { iss, aud: 'authenticated', role: 'authenticated', sub: A, exp: Math.floor(Date.now() / 1000) + 600 };
  const first = fakeJwt({ iss, n: 1 });
  const relogin = fakeJwt({ iss, n: 2 });
  claims.set(first, { ...base, session_id: SA });
  claims.set(relogin, { ...base, session_id: SB });
  const realVerify = createLoginVerifier({ config, judgeKeySet: async () => { throw new Error('unused'); },
    supabaseClient: { auth: { getClaims: async token => ({ data: { claims: claims.get(token) }, error: null }) } } });
  const db = fakeDeviceDb();
  const store = { list: async () => [] };
  const api = createNotesApi({ verify: realVerify, store, devices: createDeviceApprovalStore(db) });
  const devicesApi = createDevicesApi({ verify: realVerify, devices: createDeviceApprovalStore(db) });
  const jar = token => ({ ...SAME, cookie: `${ACCESS_COOKIE}=${token}` });

  assert.deepEqual((await call(api.collection, { headers: jar(first) })).body, { error: 'DEVICE_NOT_APPROVED' });
  await call(devicesApi.request, { method: 'POST', headers: jar(first), body: '{}' });
  assert.deepEqual(db.rows.map(r => [r.owner_id, r.device_id]), [[A, SA]]); // session from the token
  db.setStatus(A, SA, 'approved');
  assert.equal((await call(api.collection, { headers: jar(first) })).status, 200);
  assert.equal((await call(api.collection, { headers: jar(relogin) })).status, 403);
  assert.equal((await call(api.collection, { headers: jar('aaaaaaaaaa.bbbbbbbbbb.cccccccccc') })).status, 401);
});
