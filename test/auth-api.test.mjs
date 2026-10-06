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

function call(handler, { method = 'POST', action, body, authorization } = {}) {
  return new Promise(resolve => {
    const headers = new Map();
    const request = { method, query: { action }, body, headers: authorization ? { authorization } : {} };
    const response = {
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers }) }; },
    };
    handler(request, response);
  });
}

test('로그인: 맞는 정보는 토큰과 이메일만 돌려주고 사용자 ID는 내보내지 않는다', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  const ok = await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'right' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.body).sort(), ['accessToken', 'email', 'expiresAt', 'refreshToken']);
  assert.ok(!JSON.stringify(ok.body).includes('u-1'));
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  const bad = await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'wrong' } });
  assert.deepEqual([bad.status, bad.body], [401, { error: 'LOGIN_FAILED' }]);
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

test('갱신과 로그아웃', async () => {
  const log = [];
  const handler = createAuthApi({ newClient: () => fakeClient(log) });
  assert.equal((await call(handler, { action: 'refresh', body: { refreshToken: 'refresh-token-1' } })).status, 200);
  assert.equal((await call(handler, { action: 'refresh', body: { refreshToken: 'nope' } })).status, 401);
  assert.equal((await call(handler, { action: 'refresh', body: {} })).status, 400);

  assert.equal((await call(handler, { action: 'logout' })).status, 401);
  assert.equal((await call(handler, { action: 'logout', authorization: 'Bearer short' })).status, 401);
  assert.equal((await call(handler, { action: 'logout', authorization: 'Bearer zzzzzzzzzz.yyyyyyyyyy.xxxxxxxxxx' })).status, 401);
  const out = await call(handler, { action: 'logout', authorization: `Bearer ${JWT}` });
  assert.deepEqual([out.status, out.body], [200, { ok: true }]);
});

test('Supabase 오류가 터져도 내부 문구 없이 502로 답한다', async () => {
  const handler = createAuthApi({ newClient: () => ({ auth: { async signInWithPassword() { throw new Error('secret detail'); } } }) });
  const result = await call(handler, { action: 'login', body: { email: 'a@example.test', password: 'x' } });
  assert.deepEqual([result.status, result.body], [502, { error: 'AUTH_UNAVAILABLE' }]);
});
