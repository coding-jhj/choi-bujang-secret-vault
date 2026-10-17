import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks, CASE_BY_ATTACK_ID, NOT_RUN_WRITE_OR_SECRET, NOT_RUN_LIVE_FAILED, ATTACK_ID_HEADER } from '../src/attack-check.mjs';
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

// Stub that records every (target, init) it is called with and answers 401 JSON plus a server id.
const recordingFetch = (body, serverId) => {
  const calls = [];
  const fetchImpl = async (target, init) => {
    calls.push({ target, init });
    return new Response(JSON.stringify(body), {
      status: 401, headers: { 'content-type': 'application/json', 'x-vercel-id': serverId },
    });
  };
  return { calls, fetchImpl };
};
// Case-insensitive header lookup that works for any init.headers shape (object, Headers, pairs).
const headerOf = (call, name) => new Headers(call.init?.headers).get(name);

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
  const { calls, fetchImpl } = recordingFetch({ ok: true }, 'LEAKED-LIVE-PROBE');
  const results = await runAttackChecks(config, { fetchImpl });
  for (const attackId of WRITE_OR_SECRET_IDS) {
    const item = results.find(r => r.attackId === attackId);
    assert.equal(item.observed, NOT_RUN_WRITE_OR_SECRET, attackId);
    // 14차: not just labelled not_run - no request may go out carrying this attackId's header.
    assert.ok(!calls.some(call => headerOf(call, 'x-attack-id') === attackId), `${attackId}: a request was sent`);
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

// 14차: the judge links each real request to its attackId by the X-Attack-Id request header, so the
// header must be on EVERY fetch (nosniff_header and public_files_no_key do not go through probe())
// and the observed text must name it.
test('실제로 보내는 모든 GET 요청은 X-Attack-Id 헤더에 자기 attackId를 싣고, 관찰 문구에도 그렇게 적는다', async () => {
  assert.equal(ATTACK_ID_HEADER, 'X-Attack-Id'); // the wire name the judge looks for
  const liveIds = Object.keys(CASE_BY_ATTACK_ID).filter(id => !WRITE_OR_SECRET_IDS.includes(id));
  const { calls, fetchImpl } = recordingFetch({ error: 'LOGIN_REQUIRED' }, 'icn1::header-test-id');
  const results = await runAttackChecks(config, { fetchImpl });

  // 13 fetches, counted from the code: ten probes send one request each (nine through probe(), plus
  // nosniff_header's fetch of '/'), and public_files_no_key sends three ('/', '/auth-config.json',
  // '/supabase.js' - this stub's body holds no key string, so it does not return after the first).
  assert.equal(calls.length, 13);
  const sent = calls.map(call => headerOf(call, 'x-attack-id'));
  for (const id of sent) {
    assert.ok(Object.hasOwn(CASE_BY_ATTACK_ID, id), `X-Attack-Id missing or unknown: ${id}`);
    assert.ok(!WRITE_OR_SECRET_IDS.includes(id), `${id} is a write/secret check and must never be sent`);
  }
  assert.equal(new Set(sent).size, 11);
  assert.deepEqual([...new Set(sent)].sort(), [...liveIds].sort());
  for (const id of liveIds) {
    assert.equal(sent.filter(value => value === id).length, id === 'public_files_no_key' ? 3 : 1, id);
  }

  // Moving the old direct fetches behind the header must not drop what they already set, and the
  // forged Authorization must stay on forged_token_list only.
  for (const call of calls) {
    const id = headerOf(call, 'x-attack-id');
    assert.equal(call.init.redirect, 'error', id);
    assert.ok(call.init.signal instanceof AbortSignal, id);
    assert.equal(call.init.method ?? 'GET', 'GET', id);
    const authorization = headerOf(call, 'authorization');
    if (id === 'forged_token_list') assert.ok(authorization, 'forged_token_list lost its Authorization header');
    else assert.equal(authorization, null, `${id} must not carry Authorization`);
  }
  // The one request that leaves the app origin (Supabase REST) is tagged too.
  const rest = calls.find(call => headerOf(call, 'x-attack-id') === 'original_api_no_key_read');
  assert.equal(new URL(rest.target).hostname, new URL(config.originalApiUrl).hostname);

  for (const id of liveIds) {
    const item = results.find(r => r.attackId === id);
    assert.ok(item.observed.startsWith('증거 확인됨'), item.observed);
    assert.ok(item.observed.includes(`[${ATTACK_ID_HEADER}=${id}]`), item.observed);
    assert.ok(item.observed.length <= 300, `${id}: ${item.observed.length}`);
  }
  const listed = results.find(r => r.attackId === 'no_login_list');
  assert.ok(listed.observed.includes('GET /api/notes [X-Attack-Id=no_login_list] -> HTTP 401, JSON 예'), listed.observed);
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
