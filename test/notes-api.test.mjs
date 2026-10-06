import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotesApi, createSupabaseStore } from '../src/notes-api.mjs';
import { createLoginVerifier } from '../src/verify-login.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function memoryStore() {
  const rows = new Map();
  let next = 0;
  const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;
  return {
    async list(owner) { return [...rows.values()].filter(r => r.owner === owner).map(({ owner: _o, ...n }) => n); },
    async create(owner, { title, body }) { const key = id(); rows.set(key, { id: key, owner, title, body }); return key; },
    async get(owner, key) { const r = rows.get(key); return r && r.owner === owner ? { id: r.id, title: r.title, body: r.body } : null; },
    async update(owner, key, { title, body }) { const r = rows.get(key); if (!r || r.owner !== owner) return null; Object.assign(r, { title, body }); return { id: r.id, title, body }; },
    async remove(owner, key) { const r = rows.get(key); return r && r.owner === owner ? rows.delete(key) : false; },
  };
}

const verify = async authorization => {
  if (authorization === 'Bearer user-a') return { userId: A };
  if (authorization === 'Bearer user-b') return { userId: B };
  return null;
};

function call(handler, { method = 'GET', token, body, query } = {}) {
  return new Promise(resolve => {
    const headers = new Map();
    const request = { method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
    const response = {
      setHeader: (k, v) => headers.set(k.toLowerCase(), v),
      status(code) { return { json: payload => resolve({ status: code, body: payload, headers }) }; },
    };
    handler(request, response);
  });
}

test('로그인 없이는 모든 경로가 401과 JSON 오류로 거부된다', async () => {
  const api = createNotesApi({ verify, store: memoryStore() });
  for (const method of ['GET', 'POST']) {
    const result = await call(api.collection, { method, body: { title: 't', body: 'b' } });
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: 'LOGIN_REQUIRED' });
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const result = await call(api.item, { method, query: { id: '00000000-0000-4000-8000-000000000001' } });
    assert.equal(result.status, 401);
  }
  assert.equal((await call(api.collection, { token: 'forged' })).status, 401);
});

test('검증기가 예외를 던져도 거부한다', async () => {
  const api = createNotesApi({ verify: async () => { throw new Error('boom'); }, store: memoryStore() });
  assert.equal((await call(api.collection, { token: 'user-a' })).status, 401);
});

test('로그인한 사용자는 메모를 추가·조회·수정·삭제하고 지운 뒤 GET은 404다', async () => {
  const api = createNotesApi({ verify, store: memoryStore() });
  const created = await call(api.collection, { method: 'POST', token: 'user-a', body: { title: '제목', body: '내용' } });
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.deepEqual((await call(api.item, { token: 'user-a', query: { id } })).body, { id, title: '제목', body: '내용' });
  assert.deepEqual((await call(api.collection, { token: 'user-a' })).body, [{ id, title: '제목', body: '내용' }]);
  assert.deepEqual((await call(api.collection, { token: 'user-b' })).body, []);
  const updated = await call(api.item, { method: 'PUT', token: 'user-a', query: { id }, body: { title: '새 제목', body: '새 내용' } });
  assert.deepEqual(updated.body, { id, title: '새 제목', body: '새 내용' });
  assert.equal((await call(api.item, { method: 'DELETE', token: 'user-a', query: { id } })).status, 200);
  assert.equal((await call(api.item, { token: 'user-a', query: { id } })).status, 404);
});

test('다른 사용자의 메모는 읽기·수정·삭제 모두 404이고 내용이 바뀌지 않는다', async () => {
  const api = createNotesApi({ verify, store: memoryStore() });
  const { id } = (await call(api.collection, { method: 'POST', token: 'user-a', body: { title: 'A 메모', body: 'A 내용' } })).body;
  const other = { token: 'user-b', query: { id } };
  assert.deepEqual((await call(api.item, other)).body, { error: 'NOT_FOUND' });
  assert.equal((await call(api.item, { ...other, method: 'GET' })).status, 404);
  const put = await call(api.item, { ...other, method: 'PUT', body: { title: '탈취', body: '탈취', owner_id: B } });
  assert.equal(put.status, 404);
  assert.equal((await call(api.item, { ...other, method: 'DELETE' })).status, 404);
  assert.deepEqual((await call(api.item, { token: 'user-a', query: { id } })).body, { id, title: 'A 메모', body: 'A 내용' });
  assert.deepEqual((await call(api.collection, { token: 'user-b' })).body, []);
});

test('잘못된 입력과 id, 허용되지 않은 방법을 거부한다', async () => {
  const api = createNotesApi({ verify, store: memoryStore() });
  for (const body of [null, {}, { title: '', body: 'x' }, { title: 'x' }, { title: 'x', body: 1 },
    { title: 'x'.repeat(201), body: '' }, { title: 'x', body: 'y'.repeat(5001) }, [], 'not json']) {
    assert.equal((await call(api.collection, { method: 'POST', token: 'user-a', body })).status, 400);
  }
  assert.equal((await call(api.item, { token: 'user-a', query: { id: 'not-a-uuid' } })).status, 404);
  assert.equal((await call(api.collection, { method: 'DELETE', token: 'user-a' })).status, 405);
  assert.equal((await call(api.item, { method: 'POST', token: 'user-a', query: { id: A } })).status, 405);
});

test('저장소 오류는 내부 내용 없이 502로만 알린다', async () => {
  const store = memoryStore();
  store.list = async () => { throw new Error('secret db detail'); };
  const result = await call(createNotesApi({ verify, store }).collection, { token: 'user-a' });
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, { error: 'NOTES_UNAVAILABLE' });
});

test('Supabase 저장소는 content 칸을 body로 바꿔 돌려주고 DB 오류를 던진다', async () => {
  const calls = [];
  const chain = result => {
    const q = { select: () => q, eq: (...a) => { calls.push(a); return q; }, order: () => Promise.resolve(result),
      single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result) };
    return q;
  };
  const ok = createSupabaseStore({ from: () => chain({ data: [{ id: 'i', title: 't', content: 'c' }], error: null }) });
  assert.deepEqual(await ok.list(A), [{ id: 'i', title: 't', body: 'c' }]);
  assert.deepEqual(calls[0], ['owner_id', A]);
  calls.length = 0;
  const one = createSupabaseStore({ from: () => chain({ data: { id: 'i', title: 't', content: 'c' }, error: null }) });
  await one.get(A, 'note-id');
  assert.deepEqual(calls, [['id', 'note-id'], ['owner_id', A]]);
  const bad = createSupabaseStore({ from: () => chain({ data: null, error: { message: 'x' } }) });
  await assert.rejects(bad.list(A));
});

test('로그인 검증기는 형식이 틀린 토큰과 알 수 없는 발급자를 거부한다', async () => {
  const config = { judgeIssuer: 'https://judge.up.railway.app/defense/judge',
    publicAppUrl: 'https://app-name.vercel.app',
    identityProvider: { issuer: 'https://abcdefgh.supabase.co/auth/v1', audience: 'authenticated',
      jwksUrl: 'https://abcdefgh.supabase.co/auth/v1/.well-known/jwks.json' } };
  const verifyLogin = createLoginVerifier({ config, supabaseSecretKey: 'k',
    judgeKeySet: async () => { throw new Error('no key'); } });
  assert.equal(await verifyLogin(undefined), null);
  assert.equal(await verifyLogin('Bearer not-a-jwt'), null);
  assert.equal(await verifyLogin('Bearer aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc'), null);
});
