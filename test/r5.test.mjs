import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks, CASE_BY_ATTACK_ID } from '../src/attack-check.mjs';
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

// S12_SCREEN_MISMATCH: attack-check.mjs no longer sends its own requests. Every attackId must map
// to a real src/campaign-cases.mjs catalog id; these fixtures look like what
// scripts/campaign-retest.mjs actually writes.
const AT = '2026-10-15T08:41:31.000Z';
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
  assert.equal(Object.keys(CASE_BY_ATTACK_ID).length, 18);
  for (const [attackId, caseId] of Object.entries(CASE_BY_ATTACK_ID)) {
    assert.ok(CAMPAIGN_CASES.some(item => item.id === caseId), `${attackId} -> ${caseId}`);
  }
  // No two attackIds may silently share one piece of evidence.
  assert.equal(new Set(Object.values(CASE_BY_ATTACK_ID)).size, 18);
});

test('attack check reports the committed campaign-retest evidence, never a result it invented itself', async () => {
  const allPass = stored(Object.values(CASE_BY_ATTACK_ID).map(caseId => passEntry(caseId)));
  const results = await runAttackChecks(config, { stored: allPass });
  assert.deepEqual(results.map(item => item.attackId), Object.keys(CASE_BY_ATTACK_ID));
  for (const item of results) {
    const caseId = CASE_BY_ATTACK_ID[item.attackId];
    const entry = allPass.cases.find(c => c.id === caseId);
    assert.ok(item.observed.startsWith('증거 확인됨'), item.attackId);
    assert.ok(item.observed.includes(`HTTP ${entry.status}`), item.attackId);
    assert.ok(item.observed.includes(entry.serverRequestId), item.attackId);
    assert.equal(typeof item.expected, 'string');
    assert.ok(item.expected.length > 0);
  }
});

test('campaign-retest를 아직 돌리지 않았으면 전부 정직하게 미실행이다 (가짜 통과 없음)', async () => {
  // `stored: undefined` is intentionally excluded here: it is indistinguishable from omitting the
  // second argument entirely (both read the real results file) - see the dedicated test below.
  for (const absent of [null, { schema: RESULTS_SCHEMA, ran: false, cases: [] }]) {
    const results = await runAttackChecks(config, { stored: absent });
    assert.equal(results.length, 18);
    assert.ok(results.every(item => item.observed.startsWith('미실행')));
  }
});

test('campaign-retest가 일부만 다뤘으면 다룬 것만 통과로, 나머지는 미실행으로 남는다', async () => {
  const partial = stored([passEntry('S03-01')]);
  const results = await runAttackChecks(config, { stored: partial });
  const byId = Object.fromEntries(results.map(item => [item.attackId, item.observed]));
  assert.ok(byId.no_login_list.startsWith('증거 확인됨'));
  for (const attackId of Object.keys(CASE_BY_ATTACK_ID)) {
    if (attackId === 'no_login_list') continue;
    assert.ok(byId[attackId].startsWith('미실행'), attackId);
  }
});

test('저장된 기대값이 카탈로그와 다르면(stale) 또는 형식이 틀리면(invalid) 통과로 보이지 않는다', async () => {
  const staleResults = await runAttackChecks(config, {
    stored: stored([passEntry('S03-01', { expected: '다른 기대값' })]),
  });
  assert.ok(staleResults.find(item => item.attackId === 'no_login_list').observed.startsWith('stale'));

  const invalidResults = await runAttackChecks(config, {
    stored: stored([passEntry('S03-01', { serverRequestId: '' })]),
  });
  assert.ok(invalidResults.find(item => item.attackId === 'no_login_list').observed.startsWith('invalid'));
});

test('5단계 미만에서는 구현을 요구하며 던진다', async () => {
  await assert.rejects(runAttackChecks({ ...config, step: 4 }, { stored: null }));
  await assert.rejects(runAttackChecks({ ...config, step: undefined }, { stored: null }));
});

test('results 파일이 없어도(첫 clone) 읽기를 시도만 하고 조용히 미실행으로 넘어간다', async () => {
  // No `stored` override here: this exercises the real readFile(RESULTS_PATH) path. The repo's
  // actual ops/campaign-retest-results.json may or may not exist/cover every case at test time;
  // this only asserts the function never throws and always returns exactly 18 well-formed items.
  const results = await runAttackChecks(config);
  assert.equal(results.length, 18);
  for (const item of results) {
    assert.equal(typeof item.observed, 'string');
    assert.ok(item.observed.length > 0);
  }
});
