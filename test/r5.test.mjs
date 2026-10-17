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
// run itself sent - a live GET probe's own real result, or the bare `not_run` token. Tests below
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

// 15차: observed is English tokens only (a status line, or the bare `not_run`) and stays inside the
// 300-char cap scripts/bundle.mjs enforces. Every run below is passed through this.
const KOREAN = /[\u3131-\uD79D]/;
const assertEnglishWithinCap = results => {
  for (const { attackId, observed } of results) {
    assert.ok(!KOREAN.test(observed), `${attackId}: Korean character in observed: ${observed}`);
    assert.ok(observed.length <= 300, `${attackId}: observed is ${observed.length} chars`);
  }
};

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
  // 15차: the bare token, nothing appended (the 13차 pointer sentence is gone).
  assert.equal(NOT_RUN_WRITE_OR_SECRET, 'not_run');
  assert.equal(NOT_RUN_LIVE_FAILED, 'not_run');
  for (const attackId of WRITE_OR_SECRET_IDS) {
    const item = results.find(r => r.attackId === attackId);
    assert.equal(item.observed, 'not_run', attackId);
    // 14차: not just labelled not_run - no request may go out carrying this attackId's header.
    assert.ok(!calls.some(call => headerOf(call, 'x-attack-id') === attackId), `${attackId}: a request was sent`);
  }
  assertEnglishWithinCap(results);
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
  // 15차: exactly the request path, the real status and the JSON flag. The x-vercel-id the stub sends
  // is not echoed, and there is no prefix or verdict word.
  assert.equal(item.observed, 'GET /api/notes -> HTTP 401, JSON');
  assertEnglishWithinCap(results);
});

// 14차: the judge links each real request to its attackId by the X-Attack-Id request header, so the
// header must be on EVERY fetch. 15차: it travels only as that request header - observed no longer names it.
test('실제로 보내는 모든 GET 요청은 X-Attack-Id 헤더에 자기 attackId를 싣고, 관찰 문구에는 상태와 JSON 여부만 적는다', async () => {
  assert.equal(ATTACK_ID_HEADER, 'X-Attack-Id'); // the wire name the judge looks for
  const liveIds = Object.keys(CASE_BY_ATTACK_ID).filter(id => !WRITE_OR_SECRET_IDS.includes(id));
  const serverId = 'icn1::header-test-id';
  const { calls, fetchImpl } = recordingFetch({ error: 'LOGIN_REQUIRED' }, serverId);
  const results = await runAttackChecks(config, { fetchImpl });

  // 13 fetches, counted from the code: ten probes send one request each, and public_files_no_key
  // always sends three ('/', '/auth-config.json', '/supabase.js'). All of them go through probe().
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

  // The header is request-side only: every live observed is a plain status line with none of the old
  // noise (evidence prefix, X-Attack-Id tag, server request id, timestamp label).
  for (const id of liveIds) {
    const item = results.find(r => r.attackId === id);
    assert.match(item.observed, /^GET \S+ -> HTTP \d{3}, (JSON|not JSON)/, id);
    for (const noise of ['증거', 'X-Attack-Id', '서버 요청ID', '확인 시각', serverId]) {
      assert.ok(!item.observed.includes(noise), `${id}: observed contains "${noise}": ${item.observed}`);
    }
  }
  assertEnglishWithinCap(results);
});

// 15차: the exact observed text of all 11 live probes. The stub answers 401 JSON on every path, so the
// table also pins "the real status, whatever it is": /data.json and /aleph.json are recorded as 401, not
// forced to an expected 404/200, and no verdict word appears anywhere.
test('실시간 GET 11건의 observed는 "GET <경로> -> HTTP <상태>, JSON|not JSON" 영어 토큰 형식 그대로다', async () => {
  const { fetchImpl } = recordingFetch({ error: 'LOGIN_REQUIRED' }, 'icn1::format-test-id');
  const results = await runAttackChecks(config, { fetchImpl });
  const live = Object.fromEntries(results
    .filter(item => !WRITE_OR_SECRET_IDS.includes(item.attackId))
    .map(item => [item.attackId, item.observed]));
  assert.deepEqual(live, {
    no_login_list: 'GET /api/notes -> HTTP 401, JSON',
    forged_token_list: 'GET /api/notes -> HTTP 401, JSON',
    no_login_item_read: 'GET /api/notes/00000000-0000-4000-8000-000000000000 -> HTTP 401, JSON',
    no_login_announcements_list: 'GET /api/announcements -> HTTP 401, JSON',
    no_login_device_status: 'GET /api/devices/status -> HTTP 401, JSON',
    original_api_no_key_read: 'GET /rest/v1/notes?select=id -> HTTP 401, JSON',
    public_data_json_read: 'GET /data.json -> HTTP 401, JSON',
    aleph_json_open: 'GET /aleph.json -> HTTP 401, JSON',
    no_login_ops_summary: 'GET /api/ops/summary -> HTTP 401, JSON',
    nosniff_header: 'GET / -> HTTP 401, JSON, X-Content-Type-Options: none',
    public_files_no_key: 'GET / -> HTTP 401, JSON, key string absent; GET /auth-config.json -> HTTP 401; GET /supabase.js -> HTTP 401',
  });
  assertEnglishWithinCap(results);
});

// 15차: the two probes whose line is not a plain `GET <path> -> HTTP <status>, JSON|not JSON`.
test('nosniff_header와 public_files_no_key는 정해진 영어 토큰 형식으로만 적고, 세 요청 중 하나라도 실패하면 미실행이다', async () => {
  // Key-shaped, but assembled here so no key literal sits in the source of this public repo.
  const fakeKey = ['sb', 'publishable', 'A'.repeat(24)].join('_');
  const page = { status: 200, headers: { 'content-type': 'text/html', 'x-content-type-options': 'nosniff' }, body: '<!doctype html><title>home</title>' };
  // routes: pathname -> { status, headers, body } or { throws: true }; any other path answers 404 (not JSON).
  const run = async routes => {
    const fetchImpl = async target => {
      const route = routes[new URL(target).pathname] ?? { status: 404, body: 'Not Found' };
      if (route.throws) throw new Error('test: unreachable');
      return new Response(route.body, { status: route.status, headers: { ...route.headers, 'x-vercel-id': 'icn1::variant-test-id' } });
    };
    const results = await runAttackChecks(config, { fetchImpl });
    assertEnglishWithinCap(results);
    return Object.fromEntries(results.map(item => [item.attackId, item.observed]));
  };
  const homeLine = 'GET / -> HTTP 200, not JSON';

  const clean = await run({ '/': page });
  assert.equal(clean.nosniff_header, `${homeLine}, X-Content-Type-Options: nosniff`);
  assert.equal(clean.public_files_no_key,
    `${homeLine}, key string absent; GET /auth-config.json -> HTTP 404; GET /supabase.js -> HTTP 404`);

  // No X-Content-Type-Options header at all -> the word `none`.
  const bare = await run({ '/': { ...page, headers: { 'content-type': 'text/html' } } });
  assert.equal(bare.nosniff_header, `${homeLine}, X-Content-Type-Options: none`);

  // A key-shaped string on the first screen flips the flag to `present`; the string itself is never copied.
  const leaky = await run({ '/': { ...page, body: `<script>window.k='${fakeKey}'</script>` } });
  assert.equal(leaky.public_files_no_key,
    `${homeLine}, key string present; GET /auth-config.json -> HTTP 404; GET /supabase.js -> HTTP 404`);
  for (const text of Object.values(leaky)) assert.ok(!text.includes(fakeKey), text);

  // The real status, whatever it is: an old key file that answers 200 is listed as 200, with no verdict.
  const open = await run({ '/': page, '/supabase.js': { status: 200, body: 'x' } });
  assert.equal(open.public_files_no_key,
    `${homeLine}, key string absent; GET /auth-config.json -> HTTP 404; GET /supabase.js -> HTTP 200`);

  // If any of the three fetches throws, the whole public_files_no_key entry is not_run - never a partial line.
  for (const path of ['/auth-config.json', '/supabase.js']) {
    const broken = await run({ '/': page, [path]: { throws: true } });
    assert.equal(broken.public_files_no_key, 'not_run', path);
    assert.equal(broken.nosniff_header, `${homeLine}, X-Content-Type-Options: nosniff`, path); // unaffected
  }
  const noHome = await run({ '/': { throws: true } });
  assert.equal(noHome.public_files_no_key, 'not_run');
  assert.equal(noHome.nosniff_header, 'not_run');
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
  assertEnglishWithinCap(results);
});

test('publicAppUrl이 유효하지 않으면 GET 전용 점검도 전부 미실행이다 (보낼 주소가 없음)', async () => {
  const results = await runAttackChecks({ ...config, publicAppUrl: 'not a url' }, { fetchImpl: noNetwork });
  assert.equal(results.length, 20);
  for (const item of results) {
    const expectedMessage = WRITE_OR_SECRET_IDS.includes(item.attackId) ? NOT_RUN_WRITE_OR_SECRET : NOT_RUN_LIVE_FAILED;
    assert.equal(item.observed, expectedMessage, item.attackId);
  }
  assertEnglishWithinCap(results);
});

test('5단계 미만에서는 구현을 요구하며 던진다', async () => {
  await assert.rejects(runAttackChecks({ ...config, step: 4 }));
  await assert.rejects(runAttackChecks({ ...config, step: undefined }));
});
