import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks, CASE_BY_ATTACK_ID, NOT_RUN_WRITE_OR_SECRET, NOT_RUN_LIVE_FAILED } from '../src/attack-check.mjs';
import { CAMPAIGN_CASES } from '../src/campaign-cases.mjs';

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

// split_votes (10차, 2026-10-16): this file no longer reads or replays
// ops/campaign-retest-results.json at all. Every attackId's `observed` comes only from what THIS
// run itself sent - a live GET probe's own real result, or a fixed not_run message. Tests below
// never pass a `stored` option any more; there is no such option left to pass.
const noNetwork = async () => { throw new Error('test: no network'); };

test('attack check attackId 매핑은 전부 campaign-cases.mjs의 실제 항목을 가리킨다', () => {
  assert.equal(Object.keys(CASE_BY_ATTACK_ID).length, 20);
  for (const [attackId, caseId] of Object.entries(CASE_BY_ATTACK_ID)) {
    assert.ok(CAMPAIGN_CASES.some(item => item.id === caseId), `${attackId} -> ${caseId}`);
  }
  // No two attackIds may silently share one piece of evidence.
  assert.equal(new Set(Object.values(CASE_BY_ATTACK_ID)).size, 20);
});

// 9차 재발(evidence_rejected, 1첩반상/S12-01 등) 대응: write/composite attackId never sends a real
// request from here (no secret, no write traffic), so it is always not_run - no fetch result, no
// matter how convincing, may turn it into a claimed pass.
const WRITE_OR_SECRET_IDS = ['no_login_create', 'no_login_restore', 'no_login_announcements_create',
  'no_login_device_request', 'original_api_no_key_write', 'login_bad_credentials',
  'combined_no_login_and_cross_owner_read', 'combined_unapproved_then_revoked_session',
  'combined_restore_then_unsigned_and_cross_zone'];

test('쓰기 요청·비밀값이 필요한 점검(합성 공격 포함)은 fetch가 뭘 돌려주든 항상 미실행이다', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true }), {
    status: 401, headers: { 'content-type': 'application/json', 'x-vercel-id': 'LEAKED-LIVE-PROBE' },
  });
  const results = await runAttackChecks(config, { fetchImpl });
  for (const attackId of WRITE_OR_SECRET_IDS) {
    const item = results.find(r => r.attackId === attackId);
    assert.equal(item.observed, NOT_RUN_WRITE_OR_SECRET, attackId);
  }
});

test('공개 GET 점검(no_login_list)은 이번 실행이 실제로 보낸 요청의 결과를 보고한다', async () => {
  const fetchImpl = async (target) => {
    assert.equal(new URL(target).pathname, '/api/notes');
    return new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), {
      status: 401, headers: { 'content-type': 'application/json', 'x-vercel-id': 'icn1::live-test-id' },
    });
  };
  const results = await runAttackChecks(config, { fetchImpl });
  const item = results.find(r => r.attackId === 'no_login_list');
  assert.ok(item.observed.startsWith('증거 확인됨'), item.observed);
  assert.ok(item.observed.includes('HTTP 401'), item.observed);
  assert.ok(item.observed.includes('icn1::live-test-id'), item.observed);
});

// split_votes 핵심 회귀 테스트: 심판이 정확히 이 대체 경로(이전의 describeCase(caseResult))를
// 지목했다 - 이번 실행의 요청이 실패하면 커밋된 과거 증거로 대신 채우지 말고 미실행으로 남겨야
// 한다. GET 전용 11건 전부가 이 규칙을 지킨다.
test('GET 전용 점검도 이번 실행의 실제 요청이 실패하면 미실행이다 (커밋된 과거 증거로 대신 채우지 않는다)', async () => {
  const results = await runAttackChecks(config, { fetchImpl: noNetwork });
  const liveAttackIds = Object.keys(CASE_BY_ATTACK_ID).filter(id => !WRITE_OR_SECRET_IDS.includes(id));
  assert.equal(liveAttackIds.length, 11);
  for (const attackId of liveAttackIds) {
    const item = results.find(r => r.attackId === attackId);
    assert.equal(item.observed, NOT_RUN_LIVE_FAILED, attackId);
  }
});

test('publicAppUrl이 유효하지 않으면 GET 전용 점검도 전부 미실행이다 (보낼 주소가 없음)', async () => {
  const results = await runAttackChecks({ ...config, publicAppUrl: 'not a url' }, { fetchImpl: noNetwork });
  assert.equal(results.length, 20);
  for (const item of results) {
    const expectedMessage = WRITE_OR_SECRET_IDS.includes(item.attackId) ? NOT_RUN_WRITE_OR_SECRET : NOT_RUN_LIVE_FAILED;
    assert.equal(item.observed, expectedMessage, item.attackId);
  }
});

test('5단계 미만에서는 구현을 요구하며 던진다', async () => {
  await assert.rejects(runAttackChecks({ ...config, step: 4 }));
  await assert.rejects(runAttackChecks({ ...config, step: undefined }));
});
