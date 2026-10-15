import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthApi } from '../src/auth-api.mjs';

const JWT = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
const goodSession = { access_token: JWT, refresh_token: 'refresh-token-1', expires_at: 1900000000,
  user: { id: 'u-1', email: 'a@example.test' } };

function fakeClient(log) {
  return {
    auth: {
      async signInWithPassword(input) {
        log.push(['login', input.email]);
        return input.password === 'right' ? { data: { session: goodSession }, error: null }
          : { data: { session: null }, error: new Error('bad') };
      },
      async refreshSession({ refresh_token }) {
        log.push(['refresh']);
        return refresh_token === 'refresh-token-1' ? { data: { session: goodSession }, error: null }
          : { data: { session: null }, error: new Error('bad') };
      },
      admin: { async signOut(jwt) { log.push(['logout', jwt]); return { error: jwt === JWT ? null : new Error('bad') }; } },
    },
  };
}

const HOST = 'vault.example.vercel.app';
const SAME = { host: HOST, origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' };
const CROSS = { host: HOST, origin: 'https://evil.vercel.app', 'sec-fetch-site': 'cross-site' };
const AT = `__Host-byteback_at=${JWT}`;
const RT = '__Secure-byteback_rt=refresh-token-1';

function call(handler, { method = 'POST', action, body, authorization, headers: extra } = {}) {
  return new Promise(resolve => {
    const headers = new Map();
    const request = { method, query: { action }, body,
      headers: { ...extra, ...(authorization ? { authorization } : {}) } };
    const response = {
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers }) }; },
    };
    handler(request, response);
  });
}

// 11단계 보완 2 (S11_KEY_EXPOSED): 토큰은 본문이 아니라 httpOnly 쿠키로만 간다.
test('로그인: 토큰은 httpOnly·Secure·SameSite=Strict 쿠키로만 주고 본문에는 이메일·만료만 둔다', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  const ok = await call(handler, { action: 'login', headers: SAME,
    body: { email: 'a@example.test', password: 'right' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { expiresAt: 1900000000, email: 'a@example.test' });
  const text = JSON.stringify(ok.body);
  assert.ok(!text.includes(JWT) && !text.includes('refresh-token-1') && !text.includes('u-1'));
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.deepEqual(ok.headers.get('set-cookie'), [
    `__Host-byteback_at=${JWT}; Path=/; HttpOnly; Secure; SameSite=Strict`,
    '__Secure-byteback_rt=refresh-token-1; Path=/api/auth; HttpOnly; Secure; SameSite=Strict',
  ]);

  const bad = await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'wrong' } });
  assert.deepEqual([bad.status, bad.body], [401, { error: 'LOGIN_FAILED' }]);
  assert.equal(bad.headers.get('set-cookie'), undefined);
});

test('로그인: 다른 출처 페이지가 보낸 로그인은 403이고 Supabase를 부르지 않는다 (login CSRF)', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  const good = { email: 'a@example.test', password: 'right' };
  for (const headers of [CROSS, { host: HOST, origin: 'null' }, { ...SAME, 'sec-fetch-site': 'same-site' },
    { host: HOST, 'sec-fetch-site': 'cross-site' }]) {
    const denied = await call(handler, { action: 'login', headers, body: good });
    assert.deepEqual([denied.status, denied.body], [403, { error: 'CSRF_REJECTED' }]);
    assert.equal(denied.headers.get('set-cookie'), undefined);
  }
  assert.deepEqual(log, []);
  // Origin도 Sec-Fetch-Site도 없는 요청은 브라우저가 아닌 도구(피해자 쿠키를 탈 수 없음)라 허용.
  assert.equal((await call(handler, { action: 'login', body: good })).status, 200);
});

test('로그인: 형식이 틀린 본문·메서드·경로는 거부한다', async () => {
  const handler = createAuthApi({ newClient: () => fakeClient([]) });
  for (const body of [undefined, {}, { email: 1, password: 'x' }, { email: 'a@example.test', password: '' },
    { email: 'a@example.test', password: 'x'.repeat(257) }, '[]', 'not json']) {
    const result = await call(handler, { action: 'login', body });
    assert.deepEqual([result.status, result.body], [400, { error: 'INVALID_LOGIN' }]);
  }
  assert.equal((await call(handler, { action: 'login', method: 'GET' })).status, 405);
  for (const action of [undefined, 'admin', '__proto__', 'constructor']) {
    assert.equal((await call(handler, { action })).status, 404);
  }
});

test('로그인 요청마다 새 클라이언트를 쓴다', async () => {
  let made = 0;
  const handler = createAuthApi({ newClient: () => { made += 1; return fakeClient([]); } });
  await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'right' } });
  await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'right' } });
  assert.equal(made, 2);
});

const CLEARED = [
  '__Host-byteback_at=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  '__Secure-byteback_rt=; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
];

test('갱신: 갱신 쿠키만 읽고(본문 무시) 같은 출처일 때만 두 쿠키를 새로 심는다', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  const ok = await call(handler, { action: 'refresh', headers: { ...SAME, cookie: `${AT}; ${RT}` } });
  assert.deepEqual([ok.status, ok.body], [200, { expiresAt: 1900000000, email: 'a@example.test' }]);
  assert.equal(ok.headers.get('set-cookie').length, 2);
  assert.ok(!JSON.stringify(ok.body).includes(JWT));

  // 본문의 refreshToken은 더 이상 자격 증명이 아니다.
  const bodyOnly = await call(handler, { action: 'refresh', headers: SAME, body: { refreshToken: 'refresh-token-1' } });
  assert.deepEqual([bodyOnly.status, bodyOnly.body], [401, { error: 'LOGIN_REQUIRED' }]);
  assert.deepEqual(bodyOnly.headers.get('set-cookie'), CLEARED);

  const wrong = await call(handler, { action: 'refresh', headers: { ...SAME, cookie: '__Secure-byteback_rt=nope' } });
  assert.deepEqual([wrong.status, wrong.headers.get('set-cookie')], [401, CLEARED]);

  const before = log.length;
  for (const headers of [{ ...CROSS, cookie: RT }, { host: HOST, cookie: RT }]) {
    const denied = await call(handler, { action: 'refresh', headers });
    assert.deepEqual([denied.status, denied.body], [403, { error: 'CSRF_REJECTED' }]);
    assert.equal(denied.headers.get('set-cookie'), undefined);
  }
  assert.equal(log.length, before);
});

test('로그아웃: 쿠키 또는 Bearer로 세션을 끝내고 두 쿠키를 만료시킨다', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  const viaCookie = await call(handler, { action: 'logout', headers: { ...SAME, cookie: `${AT}; ${RT}` } });
  assert.deepEqual([viaCookie.status, viaCookie.body], [200, { ok: true }]);
  assert.deepEqual(viaCookie.headers.get('set-cookie'), CLEARED);
  assert.deepEqual(log.at(-1), ['logout', JWT]);

  const viaBearer = await call(handler, { action: 'logout', authorization: `Bearer ${JWT}` });
  assert.deepEqual([viaBearer.status, viaBearer.headers.get('set-cookie')], [200, CLEARED]);

  for (const authorization of [undefined, 'Bearer short', 'Bearer zzzzzzzzzz.yyyyyyyyyy.xxxxxxxxxx']) {
    const out = await call(handler, { action: 'logout', authorization });
    assert.deepEqual([out.status, out.headers.get('set-cookie')], [401, CLEARED]);
  }
});

test('로그아웃: 다른 출처에서 쿠키로 온 요청은 403이고 세션도 쿠키도 건드리지 않는다', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  for (const headers of [{ ...CROSS, cookie: AT }, { host: HOST, cookie: AT }]) {
    const denied = await call(handler, { action: 'logout', headers });
    assert.deepEqual([denied.status, denied.body], [403, { error: 'CSRF_REJECTED' }]);
    assert.equal(denied.headers.get('set-cookie'), undefined);
  }
  assert.deepEqual(log, []);
});

test('Supabase 오류가 터져도 내부 문구 없이 502로 답한다', async () => {
  const handler = createAuthApi({ newClient: () => ({ auth: { async signInWithPassword() { throw new Error('secret detail'); } } }) });
  const result = await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'x' } });
  assert.deepEqual([result.status, result.body], [502, { error: 'AUTH_UNAVAILABLE' }]);
});
