import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createNotesApi, createSupabaseStore } from '../src/notes-api.mjs';
import { createNotesRestoreApi, createSupabaseStore as createRestoreStore } from '../src/notes-restore-api.mjs';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { CLEANUP_TABLES, runRetest } from '../scripts/post-restore-retest.mjs';

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

// A fake Supabase client that really stores and filters rows per table, so the real
// createSupabaseStore code paths (insert/select/update/eq/order/limit/single) run against it.
// pgUuid: behave like Postgres uuid columns — values are stored lowercase and compared
// case-insensitively, so a mixed-case uuid from a token still matches the stored row.
function fakeSupabase({ failInsert = [], pgUuid = false } = {}) {
  const tables = {};
  let seq = 0;
  const defaults = { notes: 'created_at', notes_backup: 'backed_up_at', restore_audit: 'restored_at' };
  const UUID_COLS = new Set(['id', 'owner_id', 'source_note_id', 'note_id', 'restored_backup_id']);
  const norm = (k, v) => (pgUuid && UUID_COLS.has(k) && typeof v === 'string' ? v.toLowerCase() : v);
  const normRow = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, norm(k, v)]));
  const client = {
    tables,
    from(table) {
      const rows = (tables[table] ??= []);
      let op = 'select'; let payload; let cols = null; let order = null; let limit = Infinity;
      const filters = [];
      const pick = row => (cols ? Object.fromEntries(cols.split(',').map(c => [c, row[c]])) : { ...row });
      const shape = (hit, mode) => {
        const data = hit.map(pick);
        if (mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'single' } };
        if (mode === 'maybe') return data.length > 1 ? { data: null, error: { message: 'many' } } : { data: data[0] ?? null, error: null };
        return { data: op === 'insert' && cols === null ? null : data, error: null };
      };
      const exec = mode => {
        if (op === 'insert') {
          if (failInsert.includes(table)) return { data: null, error: { message: 'down' } };
          const row = { id: `10000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
            [defaults[table]]: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(), ...payload };
          if (rows.some(r => r.id === row.id)) return { data: null, error: { message: 'duplicate key' } };
          rows.push(row);
          return shape([row], mode);
        }
        let hit = rows.filter(r => filters.every(([k, v]) => r[k] === v));
        if (order) hit = [...hit].sort((x, y) => (x[order[0]] < y[order[0]] ? -1 : 1) * (order[1] ? 1 : -1));
        hit = hit.slice(0, limit);
        if (op === 'update') hit.forEach(r => Object.assign(r, payload));
        if (op === 'delete') hit.forEach(r => rows.splice(rows.indexOf(r), 1));
        return shape(hit, mode);
      };
      const q = {
        select(c) { cols = c; return q; },
        insert(p) { op = 'insert'; payload = normRow(p); return q; },
        update(p) { op = 'update'; payload = normRow(p); return q; },
        delete() { op = 'delete'; return q; },
        eq(k, v) { filters.push([k, norm(k, v)]); return q; },
        order(k, { ascending }) { order = [k, ascending]; return q; },
        limit(n) { limit = n; return q; },
        single: async () => exec('single'),
        maybeSingle: async () => exec('maybe'),
        then(resolve, reject) { return Promise.resolve(exec('many')).then(resolve, reject); },
      };
      return q;
    },
  };
  return client;
}

const hex = text => createHash('sha256').update(text, 'utf8').digest('hex');

// Restore answers carry a `verification` object (보완 8). Split it off so the error/status part
// is still compared exactly, and the evidence is asserted separately.
const VERIFICATION_KEYS = ['audit', 'backupId', 'backupSha256', 'hashMatch', 'idMatch', 'ownerMatch',
  'persistedSha256', 'rolledBack'];
function splitVerification(result) {
  const { verification, ...rest } = result.body;
  assert.deepEqual(Object.keys(verification ?? {}).sort(), VERIFICATION_KEYS);
  return [result.status, rest, verification];
}

test('10단계: POST만 저장된 값으로 사본을 만들고, PUT·DELETE는 사본을 건드리지 않는다', async () => {
  const db = fakeSupabase();
  const api = createNotesApi({ verify, store: createSupabaseStore(db) });
  const created = await call(api.collection, { method: 'POST', token: 'user-b', body: { title: '  원래 제목 ', body: '원래 내용' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: created.body.id });
  const { id } = created.body;
  assert.equal(db.tables.notes_backup.length, 1);
  const [backup] = db.tables.notes_backup;
  assert.deepEqual({ source_note_id: backup.source_note_id, owner_id: backup.owner_id, title: backup.title,
    content: backup.content, content_sha256: backup.content_sha256 },
  { source_note_id: id, owner_id: B, title: '원래 제목', content: '원래 내용', content_sha256: hex('원래 내용') });
  const before = structuredClone(db.tables.notes_backup);
  assert.equal((await call(api.item, { method: 'PUT', token: 'user-b', query: { id }, body: { title: '변조', body: '변조된 내용' } })).status, 200);
  assert.deepEqual(db.tables.notes_backup, before);
  assert.equal((await call(api.item, { method: 'DELETE', token: 'user-b', query: { id } })).status, 200);
  assert.deepEqual(db.tables.notes_backup, before);
  assert.equal((await call(api.collection, { method: 'POST', token: 'user-b', body: { title: '', body: 'x' } })).status, 400);
  assert.equal(db.tables.notes_backup.length, 1);
});

test('10단계: 사본 쓰기가 실패해도 메모 저장은 201이고, 서버 로그에 메모 id만 남긴다', async () => {
  const db = fakeSupabase({ failInsert: ['notes_backup'] });
  const api = createNotesApi({ verify, store: createSupabaseStore(db) });
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const created = await call(api.collection, { method: 'POST', token: 'user-a', body: { title: 't', body: '비밀 아닌 내용' } });
    assert.equal(created.status, 201);
    assert.equal(db.tables.notes.length, 1);
    assert.equal(db.tables.notes_backup.length, 0);
    assert.deepEqual(logged, [`notes_backup: creation snapshot failed for note ${created.body.id}`]);
  } finally {
    console.error = originalError;
  }
});

test('10단계: 만들고 → PUT으로 변조 → 복구하면 원래 내용이 돌아오고 감사 기록 1건만 늘어난다', async () => {
  const db = fakeSupabase();
  const notes = createNotesApi({ verify, store: createSupabaseStore(db) });
  const restore = createNotesRestoreApi({ verify, store: createRestoreStore(db) });
  const { id } = (await call(notes.collection, { method: 'POST', token: 'user-b', body: { title: 'B 메모', body: 'B 원래 내용' } })).body;
  const other = (await call(notes.collection, { method: 'POST', token: 'user-a', body: { title: 'A 메모', body: 'A 내용' } })).body.id;
  await call(notes.item, { method: 'PUT', token: 'user-b', query: { id }, body: { title: '변조', body: '변조된 내용' } });
  const untouched = structuredClone({ a: db.tables.notes.find(n => n.id === other), backups: db.tables.notes_backup });
  assert.equal((await call(restore.item, { method: 'POST', query: { id } })).status, 401);
  assert.equal((await call(restore.item, { method: 'POST', token: 'user-a', query: { id } })).status, 404);
  assert.equal(db.tables.restore_audit, undefined);
  const restored = await call(restore.item, { method: 'POST', token: 'user-b', query: { id } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.body, 'B 원래 내용');
  assert.equal(restored.body.audit, 'recorded');
  assert.deepEqual((await call(notes.item, { token: 'user-b', query: { id } })).body, { id, title: 'B 메모', body: 'B 원래 내용' });
  assert.equal(db.tables.restore_audit.length, 1);
  const [audit] = db.tables.restore_audit;
  assert.deepEqual({ note_id: audit.note_id, owner_id: audit.owner_id, restored_backup_id: audit.restored_backup_id },
    { note_id: id, owner_id: B, restored_backup_id: db.tables.notes_backup.find(b => b.source_note_id === id).id });
  assert.deepEqual({ a: db.tables.notes.find(n => n.id === other), backups: db.tables.notes_backup }, untouched);
});

// S10_RESTORE_MISMATCH regression: restore only when id, owner and content hash all match the copy.
const verifyMixed = async authorization => {
  if (authorization === 'Bearer judge-b-upper') return { kind: 'judge', userId: B.toUpperCase(), runId: A, identity: 'b' };
  return verify(authorization);
};

test('10단계: 응답은 저장된 행의 id·소유자·내용 해시를 돌려주고 세 값이 사본과 같다', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const notes = createNotesApi({ verify, store: createSupabaseStore(db) });
  const restore = createNotesRestoreApi({ verify, store: createRestoreStore(db) });
  const { id } = (await call(notes.collection, { method: 'POST', token: 'user-b', body: { title: 'B', body: '원본 내용' } })).body;
  await call(notes.item, { method: 'PUT', token: 'user-b', query: { id }, body: { title: '변조', body: '변조' } });
  const restored = await call(restore.item, { method: 'POST', token: 'user-b', query: { id } });
  assert.equal(restored.status, 200);
  const [copy] = db.tables.notes_backup;
  const live = db.tables.notes.find(n => n.id === id);
  assert.deepEqual({ id: restored.body.id, ownerId: restored.body.ownerId, contentSha256: restored.body.contentSha256 },
    { id: copy.source_note_id, ownerId: copy.owner_id, contentSha256: copy.content_sha256 });
  assert.deepEqual({ id: live.id, owner: live.owner_id, hash: hex(live.content) },
    { id: copy.source_note_id, owner: copy.owner_id, hash: copy.content_sha256 });
  // 보완 8: the success answer carries its own verification evidence, and it matches the database.
  const [, , verification] = splitVerification(restored);
  assert.deepEqual(verification, { backupId: copy.id, backupSha256: copy.content_sha256,
    idMatch: true, ownerMatch: true, hashMatch: true, persistedSha256: hex(live.content),
    rolledBack: false, audit: 'recorded' });
  assert.equal(restored.body.audit, verification.audit);
});

test('10단계 보완 8: 해시가 변조된 사본은 409이고, 응답의 verification이 해시 불일치와 무쓰기를 보여 준다', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const { id } = await tamperedNote(db);
  const [copy] = db.tables.notes_backup;
  copy.content = '사본 내용을 몰래 바꿈';
  const result = await call(createNotesRestoreApi({ verify, store: createRestoreStore(db) }).item,
    { method: 'POST', token: 'user-b', query: { id } });
  const [status, rest, verification] = splitVerification(result);
  assert.deepEqual([status, rest], [409, { error: 'BACKUP_HASH_MISMATCH' }]);
  assert.deepEqual(verification, { backupId: copy.id, backupSha256: copy.content_sha256,
    idMatch: true, ownerMatch: true, hashMatch: false, persistedSha256: null,
    rolledBack: false, audit: 'not_written' });
  assert.equal(db.tables.notes.find(n => n.id === id).content, '변조');
  assert.equal(db.tables.restore_audit, undefined);
});

test('10단계 보완 8: 남의 메모 복구는 404이고, verification은 사본도 대조도 드러내지 않는다', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const { id } = await tamperedNote(db);
  const result = await call(createNotesRestoreApi({ verify, store: createRestoreStore(db) }).item,
    { method: 'POST', token: 'user-a', query: { id } });
  const [status, rest, verification] = splitVerification(result);
  assert.deepEqual([status, rest], [404, { error: 'NOT_FOUND' }]);
  assert.deepEqual(verification, { backupId: null, backupSha256: null, idMatch: null, ownerMatch: null,
    hashMatch: null, persistedSha256: null, rolledBack: false, audit: 'not_written' });
  assert.equal(db.tables.notes.find(n => n.id === id).content, '변조');
  assert.equal(db.tables.restore_audit, undefined);
});

test('10단계: 대소문자가 다른 같은 uuid의 주체(심판 sub)도 자기 메모를 복구한다', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const notes = createNotesApi({ verify: verifyMixed, store: createSupabaseStore(db) });
  const restore = createNotesRestoreApi({ verify: verifyMixed, store: createRestoreStore(db) });
  const { id } = (await call(notes.collection, { method: 'POST', token: 'judge-b-upper', body: { title: 'B', body: 'B 원본' } })).body;
  assert.equal((await call(notes.item, { method: 'PUT', token: 'judge-b-upper', query: { id }, body: { title: 'x', body: '변조' } })).status, 200);
  const restored = await call(restore.item, { method: 'POST', token: 'judge-b-upper', query: { id } });
  assert.equal(restored.status, 200);
  assert.equal(db.tables.notes.find(n => n.id === id).content, 'B 원본');
  assert.equal(db.tables.restore_audit.length, 1);
  // Still owner-scoped: a different user is refused and nothing is written.
  assert.equal((await call(restore.item, { method: 'POST', token: 'user-a', query: { id } })).status, 404);
  assert.equal(db.tables.restore_audit.length, 1);
});

test('10단계: 사본의 id·소유자가 요청과 다르면 쓰기 전에 409로 멈춘다', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const notes = createNotesApi({ verify, store: createSupabaseStore(db) });
  const { id } = (await call(notes.collection, { method: 'POST', token: 'user-b', body: { title: 'B', body: 'B 원본' } })).body;
  await call(notes.item, { method: 'PUT', token: 'user-b', query: { id }, body: { title: 'x', body: '변조' } });
  for (const lie of [{ ownerId: A }, { sourceNoteId: '00000000-0000-4000-8000-00000000abcd' }]) {
    const store = createRestoreStore(db);
    const real = store.findBackup;
    store.findBackup = async (...args) => ({ ...(await real(...args)), ...lie });
    const result = await call(createNotesRestoreApi({ verify, store }).item, { method: 'POST', token: 'user-b', query: { id } });
    const [status, rest, verification] = splitVerification(result);
    assert.deepEqual([status, rest], [409, { error: 'RESTORE_MISMATCH' }]);
    assert.deepEqual([verification.idMatch, verification.ownerMatch, verification.hashMatch],
      lie.ownerId ? [true, false, true] : [false, true, true]);
    assert.deepEqual([verification.persistedSha256, verification.rolledBack, verification.audit], [null, false, 'not_written']);
    assert.equal(db.tables.notes.find(n => n.id === id).content, '변조');
    assert.equal(db.tables.restore_audit, undefined);
  }
});

// S10_BACKUP_UNVERIFIED regression: a write that fails post-write verification is rolled back.
// The first restore write really persists wrong content (silent truncation); later writes are real.
// `later(real)` optionally replaces every call after the first (used to break the rollback).
function truncatingFirstWrite(store, method, later = real => real) {
  const real = store[method];
  const next = later(real);
  let first = true;
  store[method] = async (ownerId, id, input) => {
    if (!first) return next(ownerId, id, input);
    first = false;
    return real(ownerId, id, { ...input, body: input.body.slice(0, 3) });
  };
}

async function captureErrors(fn) {
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try { return { result: await fn(), logged }; } finally { console.error = originalError; }
}

async function tamperedNote(db) {
  const notes = createNotesApi({ verify, store: createSupabaseStore(db) });
  const { id } = (await call(notes.collection, { method: 'POST', token: 'user-b', body: { title: 'B', body: 'B 원본 내용' } })).body;
  await call(notes.item, { method: 'PUT', token: 'user-b', query: { id }, body: { title: 'x', body: '변조' } });
  return { id, notes };
}

test('10단계: 쓴 뒤 검증이 실패하면 복구 전 상태로 되돌리고 감사 기록을 남기지 않는다 (수정 경로)', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const { id } = await tamperedNote(db);
  const before = structuredClone(db.tables.notes.find(n => n.id === id));
  const store = createRestoreStore(db);
  truncatingFirstWrite(store, 'updateNote');
  const { result, logged } = await captureErrors(() =>
    call(createNotesRestoreApi({ verify, store }).item, { method: 'POST', token: 'user-b', query: { id } }));
  const [status, rest, verification] = splitVerification(result);
  assert.deepEqual([status, rest], [502, { error: 'RESTORE_UNVERIFIED_ROLLED_BACK' }]);
  assert.deepEqual(db.tables.notes.find(n => n.id === id), before);
  const [copy] = db.tables.notes_backup;
  assert.deepEqual(verification, { backupId: copy.id, backupSha256: copy.content_sha256,
    idMatch: true, ownerMatch: true, hashMatch: true, persistedSha256: hex(before.content),
    rolledBack: true, audit: 'not_written' });
  assert.equal(db.tables.restore_audit, undefined);
  assert.deepEqual(logged, [`notes restore: persisted row does not match backup for note ${id}`]);
});

test('10단계: 지워진 메모를 되살리다 검증이 실패하면 방금 넣은 행을 지운다 (삽입 경로)', async () => {
  const db = fakeSupabase({ pgUuid: true });
  const { id, notes } = await tamperedNote(db);
  await call(notes.item, { method: 'DELETE', token: 'user-b', query: { id } });
  const store = createRestoreStore(db);
  truncatingFirstWrite(store, 'insertNote');
  const { result } = await captureErrors(() =>
    call(createNotesRestoreApi({ verify, store }).item, { method: 'POST', token: 'user-b', query: { id } }));
  const [status, rest, verification] = splitVerification(result);
  assert.deepEqual([status, rest], [502, { error: 'RESTORE_UNVERIFIED_ROLLED_BACK' }]);
  assert.deepEqual([verification.rolledBack, verification.persistedSha256, verification.audit], [true, null, 'not_written']);
  assert.equal(db.tables.notes.some(n => n.id === id), false);
  assert.equal(db.tables.restore_audit, undefined);
});

test('10단계: 되돌리기까지 실패하면 다른 오류 코드로 알리고 성공이라 하지 않는다', async () => {
  // update path: the rollback is the 2nd updateNote call; insert path: the rollback is deleteNote.
  const breakers = {
    'update throws': { update: () => async () => { throw new Error('db'); } },
    'update returns other content': { update: real => async (o, i, x) => ({ ...(await real(o, i, x)), body: 'other' }) },
    'update returns null': { update: () => async () => null },
    'delete throws': { remove: async () => { throw new Error('db'); } },
    'delete removes nothing': { remove: async () => false },
  };
  for (const [name, { update, remove }] of Object.entries(breakers)) {
    const db = fakeSupabase({ pgUuid: true });
    const { id, notes } = await tamperedNote(db);
    if (remove) await call(notes.item, { method: 'DELETE', token: 'user-b', query: { id } });
    const store = createRestoreStore(db);
    if (remove) { truncatingFirstWrite(store, 'insertNote'); store.deleteNote = remove; }
    else truncatingFirstWrite(store, 'updateNote', update);
    const { result, logged } = await captureErrors(() =>
      call(createNotesRestoreApi({ verify, store }).item, { method: 'POST', token: 'user-b', query: { id } }));
    const [status, rest, verification] = splitVerification(result);
    assert.deepEqual([status, rest], [502, { error: 'RESTORE_UNVERIFIED_ROLLBACK_FAILED' }], name);
    assert.deepEqual([verification.rolledBack, verification.persistedSha256, verification.audit],
      [false, null, 'not_written'], name);
    assert.equal(db.tables.restore_audit, undefined, name);
    assert.deepEqual(logged, [`notes restore: persisted row does not match backup for note ${id}`,
      `notes restore: rollback FAILED for note ${id}, state uncertain`], name);
  }
});

// S10_AUDIT_DROPPED: the audit write must never be reported as recorded when it did not happen.
test('10단계: 감사 행 쓰기가 실패하면 복구는 200이어도 audit "failed"로 정직하게 알린다', async () => {
  const db = fakeSupabase({ pgUuid: true, failInsert: ['restore_audit'] });
  const { id } = await tamperedNote(db);
  const { result, logged } = await captureErrors(() =>
    call(createNotesRestoreApi({ verify, store: createRestoreStore(db) }).item, { method: 'POST', token: 'user-b', query: { id } }));
  assert.equal(result.status, 200);
  assert.equal(result.body.audit, 'failed');
  assert.equal(result.body.verification.audit, 'failed');
  assert.deepEqual(db.tables.restore_audit, []);
  assert.deepEqual(logged, [`restore_audit: insert failed for restored note ${id}`]);
});

// S10_AUDIT_DROPPED: the post-restore retest tool cleans up its throwaway rows but must never
// delete audit history. Drives runRetest's real cleanup with a recording fake admin client.
test('10단계: 복구 재시험 도구의 정리는 restore_audit를 절대 지우지 않는다', async () => {
  const ops = [];
  const owner = '12345678-1234-4234-8234-123456789abc';
  const admin = {
    auth: { admin: {
      createUser: async () => ({ data: { user: { id: owner } }, error: null }),
      deleteUser: async userId => { ops.push(['deleteUser', userId]); return { error: null }; },
    } },
    from(table) {
      ops.push(['from', table]);
      const q = {
        delete() { ops.push(['delete', table]); return q; },
        select() { return q; },
        in: async () => ({ error: null, count: 0 }),
      };
      return q;
    },
  };
  const { cleanupOk } = await runRetest({ app: new URL('https://example-app.vercel.app/'), domain: 'example.invalid' }, {
    admin, out: () => {},
    newAuthClient: () => ({ auth: { signInWithPassword: async () => ({ data: null, error: { message: 'no' } }) } }),
    fetchImpl: async () => new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), { status: 401 }),
  });
  assert.equal(cleanupOk, true);
  assert.deepEqual(ops.filter(([, table]) => table === 'restore_audit'), []);
  assert.deepEqual(ops.filter(([op]) => op === 'delete').map(([, table]) => table), ['notes_backup', 'notes']);
  assert.deepEqual(ops.filter(([op]) => op === 'deleteUser'), [['deleteUser', owner]]);
  assert.equal(CLEANUP_TABLES.includes('restore_audit'), false);
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
