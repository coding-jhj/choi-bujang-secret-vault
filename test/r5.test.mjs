import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks, CASE_BY_ATTACK_ID, NOT_RUN_WRITE_OR_SECRET } from '../src/attack-check.mjs';
import { CAMPAIGN_CASES, RESULTS_SCHEMA } from '../src/campaign-cases.mjs';

const config = {
  step: 5,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
  identityProvider: { issuer: 'https://abcdefgh.supabase.co/auth/v1' },
  originalApiUrl: 'https://abcdefgh.supabase.co/rest/v1/notes',
  allowedRoutes: ['GET /api/notes', 'POST /api/notes'],
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 5,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    originalApiUrl: config.originalApiUrl,
    allowedRoutes: config.allowedRoutes,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
  assert.throws(() => deploymentIdentity(env, { ...config, originalApiUrl: null }));
  assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: [] }));
  assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: undefined }));
  assert.throws(() => deploymentIdentity(env, { ...config, originalApiUrl: 'https://abcdefgh.supabase.co/rest/v1/notes?select=*' }));
});

// S12_SCREEN_MISMATCH / evidence_rejected: a plain-GET, unauthenticated attackId now sends a real
// live request every time this file runs (so the judge's own re-run produces a request it can
// verify itself); anything needing a write request, a secret, or a logged-in test account still
// falls back to the committed scripts/campaign-retest.mjs evidence. Tests below that exercise the
// fallback path inject a `fetchImpl` that always throws, so they never hit the real network and
// behave exactly as they did before live probing existed. A separate test exercises the live path.
const AT = '2026-10-15T08:41:31.000Z';
const noNetwork = async () => { throw new Error('test: no network'); };
const expectedFor = caseId => CAMPAIGN_CASES.find(item => item.id === caseId).expected;
const passEntry = (caseId, overrides = {}) => ({
  id: caseId, result: 'pass', status: 401, observed: 'HTTP 401',
  // A Vercel-style server-stamped id, not a locally-invented UUID - that distinction is exactly
  // what a judge flagged (S12_SCREEN_MISMATCH, 2026-10-15): an id this codebase makes up itself
  // proves nothing about a real request.
  serverRequestId: 'icn1::test-1792053690000-abc123', checkedAt: AT, expected: expectedFor(caseId), ...overrides,
});
const stored = cases => ({ schema: RESULTS_SCHEMA, ran: true, ranAt: AT, finishedAt: AT, cases });

test('attack check attackId 매핑은 전부 campaign-cases.mjs의 실제 항목을 가리킨다', () => {
  assert.equal(Object.keys(CASE_BY_ATTACK_ID).length, 20);
  for (const [attackId, caseId] of Object.entries(CASE_BY_ATTACK_ID)) {
    assert.ok(CAMPAIGN_CASES.some(item => item.id === caseId), `${attackId} -> ${caseId}`);
  }
  // No two attackIds may silently share one piece of evidence.
  assert.equal(new Set(Object.values(CASE_BY_ATTACK_ID)).size, 20);
});

// 9차 재발(evidence_rejected, 1첩반상/S12-01 등) 대응: write/composite attackId는 이제 커밋된
// 증거를 "이번 실행의 통과"처럼 재생하지 않고 항상 미실행이라고만 적는다 (judge's own correction
// text: "실제 요청이 없으면 미실행으로 남기고"). 그 9개를 뺀 나머지만 커밋된 증거를 그대로 본다.
const WRITE_OR_SECRET_IDS = ['no_login_create', 'no_login_restore', 'no_login_announcements_create',
  'no_login_device_request', 'original_api_no_key_write', 'login_bad_credentials',
  'combined_no_login_and_cross_owner_read', 'combined_unapproved_then_revoked_session',
  'combined_restore_then_unsigned_and_cross_zone'];

test('attack check reports the committed campaign-retest evidence, never a result it invented itself', async () => {
  const allPass = stored(Object.values(CASE_BY_ATTACK_ID).map(caseId => passEntry(caseId)));
  const results = await runAttackChecks(config, { stored: allPass, fetchImpl: noNetwork });
  assert.deepEqual(results.map(item => item.attackId), Object.keys(CASE_BY_ATTACK_ID));
  for (const item of results) {
    assert.equal(typeof item.expected, 'string');
    assert.ok(item.expected.length > 0);
    if (WRITE_OR_SECRET_IDS.includes(item.attackId)) {
      assert.equal(item.observed, NOT_RUN_WRITE_OR_SECRET, item.attackId);
      continue;
    }
    const caseId = CASE_BY_ATTACK_ID[item.attackId];
    const entry = allPass.cases.find(c => c.id === caseId);
    assert.ok(item.observed.startsWith('증거 확인됨'), item.attackId);
    assert.ok(item.observed.includes(`HTTP ${entry.status}`), item.attackId);
    assert.ok(item.observed.includes(entry.serverRequestId), item.attackId);
    // A judge's third memo (2026-10-15, same day) pointed out this file's observed text never
    // showed a verified timestamp, even though the judge explicitly asked for status + server id
    // + checkedAt together.
    assert.ok(item.observed.includes(entry.checkedAt), item.attackId);
  }
});

test('campaign-retest를 아직 돌리지 않았으면 전부 정직하게 미실행이다 (가짜 통과 없음)', async () => {
  // `stored: undefined` is intentionally excluded here: it is indistinguishable from omitting the
  // second argument entirely (both read the real results file) - see the dedicated test below.
  for (const absent of [null, { schema: RESULTS_SCHEMA, ran: false, cases: [] }]) {
    const results = await runAttackChecks(config, { stored: absent, fetchImpl: noNetwork });
    assert.equal(results.length, 20);
    assert.ok(results.every(item => item.observed.startsWith('미실행')));
  }
});

test('campaign-retest가 일부만 다뤘으면 다룬 것만 통과로, 나머지는 미실행으로 남는다', async () => {
  const partial = stored([passEntry('S03-01')]);
  const results = await runAttackChecks(config, { stored: partial, fetchImpl: noNetwork });
  const byId = Object.fromEntries(results.map(item => [item.attackId, item.observed]));
  assert.ok(byId.no_login_list.startsWith('증거 확인됨'));
  for (const attackId of Object.keys(CASE_BY_ATTACK_ID)) {
    if (attackId === 'no_login_list') continue;
    assert.ok(byId[attackId].startsWith('미실행'), attackId);
  }
});

test('저장된 기대값이 카탈로그와 다르면(stale) 또는 형식이 틀리면(invalid) 통과로 보이지 않는다', async () => {
  const staleResults = await runAttackChecks(config, {
    stored: stored([passEntry('S03-01', { expected: '다른 기대값' })]), fetchImpl: noNetwork,
  });
  assert.ok(staleResults.find(item => item.attackId === 'no_login_list').observed.startsWith('stale'));

  const invalidResults = await runAttackChecks(config, {
    stored: stored([passEntry('S03-01', { serverRequestId: '' })]), fetchImpl: noNetwork,
  });
  assert.ok(invalidResults.find(item => item.attackId === 'no_login_list').observed.startsWith('invalid'));
});

test('공개 GET 점검(no_login_list)은 커밋된 파일이 아니라 실제로 이번에 보낸 요청을 보고한다', async () => {
  const fetchImpl = async (target) => {
    assert.equal(new URL(target).pathname, '/api/notes');
    return new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), {
      status: 401, headers: { 'content-type': 'application/json', 'x-vercel-id': 'icn1::live-test-id' },
    });
  };
  // Stored evidence intentionally says something different (fail), to prove the live result wins.
  const results = await runAttackChecks(config, {
    stored: stored([passEntry('S03-01', { result: 'fail', status: 500 })]), fetchImpl,
  });
  const item = results.find(r => r.attackId === 'no_login_list');
  assert.ok(item.observed.startsWith('증거 확인됨'), item.observed);
  assert.ok(item.observed.includes('HTTP 401'), item.observed);
  assert.ok(item.observed.includes('icn1::live-test-id'), item.observed);
  assert.ok(!item.observed.includes('HTTP 500'), item.observed);
});

test('공개 GET 점검의 실제 요청이 실패하면(네트워크 오류) 커밋된 증거로 대체된다', async () => {
  const results = await runAttackChecks(config, {
    stored: stored([passEntry('S03-01')]), fetchImpl: noNetwork,
  });
  const item = results.find(r => r.attackId === 'no_login_list');
  assert.ok(item.observed.startsWith('증거 확인됨'), item.observed);
  assert.ok(item.observed.includes('icn1::test-1792053690000-abc123'), item.observed);
});

test('쓰기 요청·비밀값이 필요한 점검(합성 공격 포함)은 fetch나 커밋된 증거가 뭐라고 하든 항상 미실행이다', async () => {
  // Neither a fetchImpl that would make every live-probable check look like a loud, obvious
  // success, nor a committed "pass" result, may turn into a claimed pass for these 9 attackIds -
  // this run never actually sends them (9차 재발 대응, evidence_rejected).
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true }), {
    status: 401, headers: { 'content-type': 'application/json', 'x-vercel-id': 'LEAKED-LIVE-PROBE' },
  });
  const allPass = stored(Object.values(CASE_BY_ATTACK_ID).map(caseId => passEntry(caseId)));
  const results = await runAttackChecks(config, { stored: allPass, fetchImpl });
  for (const attackId of WRITE_OR_SECRET_IDS) {
    const item = results.find(r => r.attackId === attackId);
    assert.equal(item.observed, NOT_RUN_WRITE_OR_SECRET, attackId);
  }
});

test('5단계 미만에서는 구현을 요구하며 던진다', async () => {
  await assert.rejects(runAttackChecks({ ...config, step: 4 }, { stored: null }));
  await assert.rejects(runAttackChecks({ ...config, step: undefined }, { stored: null }));
});

test('results 파일이 없어도(첫 clone) 읽기를 시도만 하고 조용히 미실행으로 넘어간다', async () => {
  // No `stored` override here: this exercises the real readFile(RESULTS_PATH) path. The repo's
  // actual ops/campaign-retest-results.json may or may not exist/cover every case at test time;
  // this only asserts the function never throws and always returns exactly 20 well-formed items.
  const results = await runAttackChecks(config, { fetchImpl: noNetwork });
  assert.equal(results.length, 20);
  for (const item of results) {
    assert.equal(typeof item.observed, 'string');
    assert.ok(item.observed.length > 0);
  }
});
