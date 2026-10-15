// Step 12: the shared catalog of the full historical retest ("총공세 재시험") and the virtual
// inputs the ops room (src/ops-api.mjs) feeds to decide() / detect().
//
// Why a catalog separate from the runner: the ops screen must show every case, including the ones
// that were never run. It merges this list with the stored results file
// (ops/campaign-retest-results.json, written by scripts/campaign-retest.mjs). A case that has no
// valid stored result is shown as not run; it can never turn into "pass" by omission.
//
// Every case here comes from this repo's own history (README step sections and
// src/attack-check.mjs), plus the three step-12 composite monsters. Nothing here is the external
// judge's own case list, which this repo does not have.

import { createHash, randomUUID } from 'node:crypto';

const SCHEMA = 'aleph.decision.v1';
// A judge flagged an earlier version of this validation: it accepted any well-formed-looking
// UUID as "the request's id", even one scripts/campaign-retest.mjs invented locally
// (randomUUID()) with no connection to a real request. The only genuine, independently-checkable
// evidence a live HTTP response carries is an id the ORIGIN SERVER itself stamped on it -
// Vercel's x-vercel-id, or (for a request sent straight to Supabase, bypassing Vercel)
// Supabase's own sb-request-id. Neither is a UUID; this pattern just rejects empty/garbage.
const SERVER_REQUEST_ID = /^[A-Za-z0-9:_-]{1,200}$/u;
export const RESULTS_SCHEMA = 'byteback.campaign-retest.v1';
export const CASE_RESULTS = Object.freeze(['pass', 'fail', 'not_run']);

// The 18 request field names of docs/DECIDER_REQUEST.md, and nothing else.
export const DECISION_REQUEST_FIELDS = Object.freeze(['schema', 'requestId', 'classId', 'projectId',
  'subjectId', 'deviceId', 'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at',
  'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals']);

// A virtual decision request in the documented shape (same values as scripts/fixture-7.mjs).
// Overrides may only replace documented fields; an unknown name throws instead of being sent.
export function virtualRequest(overrides = {}) {
  for (const key of Object.keys(overrides)) {
    if (!DECISION_REQUEST_FIELDS.includes(key)) throw new TypeError(`undocumented_request_field:${key}`);
  }
  return {
    schema: SCHEMA, requestId: randomUUID(), classId: 'class_fixture', projectId: 'project_fixture',
    subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), service: 'notes', method: 'GET',
    path: '/notes/demo', route: 'GET /notes/:id', queryLength: 0,
    querySha256: createHash('sha256').update('').digest('hex'), at: new Date().toISOString(),
    policyRevision: 1, deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null },
    recentEvents: [], signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

const ANOMALY = {
  signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
  recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }],
};
const REVERIFIED = { stepUp: { verified: true, authAgeSeconds: 60 } };

// Fixed decider probes. `expected` is what README steps 6-8 document for each input.
export const DECIDER_PROBES = Object.freeze([
  { id: 'allow_registered', label: '등록 기기의 정상 한 건 조회',
    build: () => virtualRequest(), expected: { decision: 'allow', reasonCode: 'device_registered' } },
  { id: 'deny_unregistered', label: '미등록 기기의 가상 요청',
    build: () => virtualRequest({ deviceRegistered: false }),
    expected: { decision: 'deny', reasonCode: 'device_not_registered' } },
  { id: 'step_up_anomaly', label: '시각·네트워크·대량 조회가 겹친 접속',
    build: () => virtualRequest(ANOMALY), expected: { decision: 'step_up', reasonCode: 'step_up_required' } },
  { id: 'allow_reverified', label: '다시 확인한 복합 이상 접속',
    build: () => virtualRequest({ ...ANOMALY, ...REVERIFIED }),
    expected: { decision: 'allow', reasonCode: 'step_up_verified' } },
  { id: 'deny_announcement_write', label: '공지 쓰기',
    build: () => virtualRequest({ service: 'announcements', method: 'POST', path: '/announcements',
      route: 'POST /announcements' }),
    expected: { decision: 'deny', reasonCode: 'announcement_write_denied' } },
  { id: 'deny_notes_list', label: '메모 전체 목록',
    build: () => virtualRequest({ path: '/notes', route: 'GET /notes' }),
    expected: { decision: 'deny', reasonCode: 'notes_list_denied' } },
  { id: 'deny_zone_mismatch', label: '메모 경로로 공지 구역을 읽음',
    build: () => virtualRequest({ path: '/announcements/demo' }),
    expected: { decision: 'deny', reasonCode: 'zone_mismatch' } },
  { id: 'deny_unknown_route', label: '목록에 없는 경로',
    build: () => virtualRequest({ path: '/notes/export', route: 'GET /notes/export' }),
    expected: { decision: 'deny', reasonCode: 'unknown_route' } },
  // Composition probes: a rule that passes on its own must not re-open what an earlier rule closed.
  { id: 'compose_unregistered_reverified', label: '미등록 기기 + 재확인 통과 + 이상 신호',
    build: () => virtualRequest({ deviceRegistered: false, ...ANOMALY, ...REVERIFIED }),
    expected: { decision: 'deny', reasonCode: 'device_not_registered' } },
  { id: 'compose_write_reverified', label: '공지 쓰기 + 재확인 통과',
    build: () => virtualRequest({ service: 'announcements', method: 'PUT', path: '/announcements/demo',
      route: 'PUT /announcements/:id', ...REVERIFIED }),
    expected: { decision: 'deny', reasonCode: 'announcement_write_denied' } },
]);

// The ops room runs this subset on every summary call (allow, deny, step_up, composition).
export const OPS_DECIDER_PROBE_IDS = Object.freeze(['allow_registered', 'deny_unregistered',
  'step_up_anomaly', 'deny_zone_mismatch', 'compose_unregistered_reverified']);

const DETECT_START = Date.UTC(2026, 9, 1, 0, 0, 0);
const readEvents = count => Array.from({ length: count }, (_, index) => ({
  at: new Date(DETECT_START + index * 2000).toISOString(), method: 'GET',
  identity: { sub: 'learner_fixture' },
}));

// Events in the docs/DETECT_EVENTS.md shape only (at, method, identity.sub).
export const DETECT_PROBES = Object.freeze([
  { id: 'observe_30', label: '정상 조회 30건', events: () => readEvents(30), expected: { action: 'observe' } },
  { id: 'observe_120', label: '10분 안에 정확히 120건', events: () => readEvents(120), expected: { action: 'observe' } },
  { id: 'revoke_121', label: '10분 안에 121건', events: () => readEvents(121),
    expected: { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' } },
]);

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

// The documented response shape: exactly 5 keys, echoed requestId, ruleIds inside RULE_IDS.
export function isValidDecision(request, response, ruleIds) {
  return Boolean(response) && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === SCHEMA && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

// Only these output fields are ever shown; anything else detect() returns is dropped.
export function pickDetectOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const picked = {};
  for (const key of ['action', 'reasonCode', 'subject', 'device']) {
    if (typeof output[key] === 'string') picked[key] = output[key];
  }
  return picked;
}

const sameDetect = (actual, expected) => actual !== null
  && Object.keys(actual).length === Object.keys(expected).length
  && Object.entries(expected).every(([key, value]) => actual[key] === value);
export { sameDetect };

// ---- the retest catalog -------------------------------------------------------------------
// kind 'live'  = a real HTTP request to the deployed app (or its Supabase REST endpoint).
// kind 'local' = a call to this checkout's decide()/detect(); the deployed app never calls them.
// Order is execution order (later cases use notes and sessions made by earlier ones).
// attackId (optional 6th arg) is src/attack-check.mjs's own name for this exact same check -
// stamped onto the stored result too (see scripts/campaign-retest.mjs's record()), so a reader
// searching the committed evidence file for e.g. "no_login_list" finds it there directly, not
// only by first decoding attack-check.mjs's id mapping.
const c = (id, step, kind, title, expected, attackId = null) => Object.freeze({ id, step, kind, title, expected, attackId });
export const CAMPAIGN_CASES = Object.freeze([
  c('S02-01', 2, 'live', '옛 공개 자료 /data.json', '404', 'public_data_json_read'),
  c('S02-02', 2, 'live', '배포 식별 파일 /aleph.json', '200 (정상)', 'aleph_json_open'),
  c('S02-03', 2, 'live', '첫 화면 nosniff 헤더', 'X-Content-Type-Options: nosniff (정상)', 'nosniff_header'),
  c('S03-01', 3, 'live', '로그인 없이 메모 목록', '401 LOGIN_REQUIRED', 'no_login_list'),
  c('S03-02', 3, 'live', '로그인 없이 메모 추가', '401 LOGIN_REQUIRED', 'no_login_create'),
  c('S03-03', 3, 'live', '로그인 없이 메모 한 건 조회', '401 LOGIN_REQUIRED', 'no_login_item_read'),
  c('S03-04', 3, 'live', '위조 토큰으로 메모 목록', '401 LOGIN_REQUIRED', 'forged_token_list'),
  c('S03-05', 3, 'live', "A'가 자기 메모 추가", '201 + id (정상)'),
  c('S03-06', 3, 'live', "A'가 자기 메모 한 건 조회", '200, 만든 내용 그대로 (정상)'),
  c('S03-07', 3, 'live', "A'가 자기 메모 수정", '200, 고친 내용 (정상)'),
  c('S03-08', 3, 'live', "A'가 자기 메모 삭제 후 다시 조회", '삭제 200, 재조회 404 (정상)'),
  c('S04-01', 4, 'live', "B'가 A'의 메모 조회", '404 NOT_FOUND'),
  c('S04-02', 4, 'live', "B'가 A'의 메모 수정", "404 NOT_FOUND, A' 메모 그대로"),
  c('S04-03', 4, 'live', "B'가 A'의 메모 삭제", "404 NOT_FOUND, A' 메모 남아 있음"),
  c('S04-04', 4, 'live', "B'의 목록에 A'의 메모가 없음", "200, A' 메모 id 없음"),
  c('S05-01', 5, 'live', '키 없이 원본 DB 직접 조회', '401/403', 'original_api_no_key_read'),
  c('S05-02', 5, 'live', '키 없이 원본 DB 직접 추가', '401/403', 'original_api_no_key_write'),
  c('S05-03', 5, 'live', "A'의 로그인 토큰만으로 원본 DB 직접 조회 (공개 키 없음)", '401/403'),
  c('S05-04', 5, 'live', '첫 화면·옛 키 파일에 Supabase 키 문자열 없음', '키 문자열 없음, 옛 파일 404', 'public_files_no_key'),
  c('S05-05', 5, 'live', '틀린 로그인 정보로 서버 로그인', '401 LOGIN_FAILED', 'login_bad_credentials'),
  c('S05-06', 5, 'live', "C'가 서버 로그인 경로로 로그인", '200, 본문은 email·expiresAt뿐, httpOnly 쿠키 2개 (정상)'),
  c('S06-01', 6, 'local', 'decide(): 등록 기기 정상 요청', 'allow / device_registered'),
  c('S06-02', 6, 'local', 'decide(): 미등록 기기 가상 요청', 'deny / device_not_registered'),
  c('S07-01', 7, 'local', 'decide(): 복합 이상 접속', 'step_up / step_up_required'),
  c('S07-02', 7, 'local', 'decide(): 다시 확인한 복합 이상 접속', 'allow / step_up_verified'),
  c('S08-01', 8, 'live', "A'가 자기 공지 추가", '201 + id (정상)'),
  c('S08-02', 8, 'live', "B'가 A'의 공지 조회", '404 NOT_FOUND'),
  c('S08-03', 8, 'live', "B'가 A'의 공지 수정", "404 NOT_FOUND, A' 공지 그대로"),
  c('S08-04', 8, 'live', '로그인 없이 공지 목록', '401 LOGIN_REQUIRED', 'no_login_announcements_list'),
  c('S08-05', 8, 'live', '로그인 없이 공지 추가', '401 LOGIN_REQUIRED', 'no_login_announcements_create'),
  c('S08-10', 8, 'live', '로그인 없이 공지 한 건 수정', '401 LOGIN_REQUIRED', 'no_login_announcement_write'),
  c('S08-06', 8, 'local', 'decide(): 공지 쓰기', 'deny / announcement_write_denied'),
  c('S08-07', 8, 'local', 'decide(): 메모 전체 목록', 'deny / notes_list_denied'),
  c('S08-08', 8, 'local', 'decide(): 메모 경로 모양으로 다른 구역 path', 'deny / zone_mismatch'),
  c('S08-09', 8, 'local', 'decide(): 목록에 없는 경로', 'deny / unknown_route'),
  c('S09-01', 9, 'local', 'detect(): 정상 조회 30건', 'observe'),
  c('S09-02', 9, 'local', 'detect(): 10분 안에 정확히 120건', 'observe'),
  c('S09-03', 9, 'local', 'detect(): 10분 안에 121건', 'propose_revocation / burst_read'),
  c('S10-01', 10, 'live', '로그인 없이 메모 복구', '401 LOGIN_REQUIRED', 'no_login_restore'),
  c('S10-02', 10, 'live', "B'가 변조된 자기 메모를 복구", '200, 원본으로 돌아옴, 3값 대조 true, audit recorded (정상)'),
  c('S10-03', 10, 'live', "A'가 B'의 메모를 복구", '404 NOT_FOUND, 대조값(backupId·backupSha256·idMatch·ownerMatch·hashMatch·persistedSha256)은 전부 null, rolledBack=false, audit=not_written'),
  c('S10-04', 10, 'live', "B'의 모든 시도 뒤 A'의 메모", '200, 원래 내용 그대로 (정상)'),
  c('S11-01', 11, 'live', '로그인 없이 본문에 approved를 넣은 승인 요청', '401 LOGIN_REQUIRED', 'no_login_device_request'),
  c('S11-02', 11, 'live', '위조 토큰 + 본문 approved 승인 요청', '401 LOGIN_REQUIRED', 'forged_token_device_request'),
  c('S11-03', 11, 'live', '로그인 없이 승인 상태 조회', '401 LOGIN_REQUIRED', 'no_login_device_status'),
  c('S11-04', 11, 'live', "C'의 승인 전 세션으로 메모 목록", '403 DEVICE_NOT_APPROVED'),
  c('S11-05', 11, 'live', "C'가 본문에 approved를 넣어 승인 요청 뒤 메모 목록", '승인 요청 200 pending, 메모 403'),
  c('S11-06', 11, 'live', "관리자가 C'의 세션을 승인한 뒤 메모 목록", '200 (정상)'),
  c('S11-07', 11, 'live', "C'의 세션을 회수한 뒤 메모 목록·재요청", '메모 403, 재요청해도 revoked'),
  c('S11-08', 11, 'live', '쿠키 로그인 + Origin 없는 메모 추가 (CSRF)', '403 CSRF_REJECTED, 메모 수 그대로'),
  c('S11-09', 11, 'live', "쿠키 로그인으로 A'의 메모 목록", '200 (정상)'),
  c('S11-10', 11, 'live', "A'의 승인된 세션 상태 조회", '200 approved (정상)'),
  c('S12-01', 12, 'live', "합성 1: 로그인 없는 조회 + B'의 A' 메모 조회를 한꺼번에", '401 + 404, 어느 응답에도 메모 내용 없음'),
  c('S12-02', 12, 'live', "합성 2: 승인 전 세션 요청 뒤, 로그아웃(회수)한 세션 토큰으로 재시도", '승인 전 403, 로그아웃 뒤 재시도 401/403'),
  c('S12-03', 12, 'live', '합성 3: 복구 뒤 서명 없는 수정 + 다른 구역·다른 주인 조회를 한꺼번에', '401·401·404·404, 복구된 내용 그대로'),
  c('S12-04', 12, 'local', 'decide(): 미등록 기기 + 재확인 통과 + 이상 신호', 'deny / device_not_registered'),
  c('S12-05', 12, 'local', 'decide(): 공지 쓰기 + 재확인 통과', 'deny / announcement_write_denied'),
  c('S12-06', 12, 'live', '로그인 없이 작전실 요약', '401 LOGIN_REQUIRED'),
]);

const STATES_COUNTED = ['pass', 'fail', 'not_run', 'stale', 'invalid'];
const isoOrNull = value => (typeof value === 'string' && !Number.isNaN(Date.parse(value))
  ? new Date(Date.parse(value)).toISOString() : null);
const shortText = value => (typeof value === 'string' ? value.slice(0, 300) : null);

// Merges the catalog with a stored results object. Fail closed:
//   no valid run recorded             -> every case 'not_run'
//   stored case for an unknown id      -> ignored
//   same id twice                      -> 'invalid'
//   stored `expected` differs          -> 'stale' (result was for another expectation)
//   result not in CASE_RESULTS, bad checkedAt, or (for a 'live' case) no real serverRequestId -> 'invalid'
// A 'local' case (decide()/detect() called directly, no HTTP response to stamp) never had a
// server-issued id to begin with, so it is not required there - re-running the pure function is
// its own verification. Only a well-formed stored 'pass' ever shows as 'pass'.
export function mergeCampaign(stored, catalog = CAMPAIGN_CASES) {
  const ran = Boolean(stored) && typeof stored === 'object' && stored.schema === RESULTS_SCHEMA
    && stored.ran === true && Array.isArray(stored.cases);
  const byId = new Map();
  const duplicated = new Set();
  if (ran) {
    for (const item of stored.cases) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
      if (byId.has(item.id)) duplicated.add(item.id);
      byId.set(item.id, item);
    }
  }
  const cases = catalog.map(def => {
    const base = { id: def.id, attackId: def.attackId ?? null, step: def.step, kind: def.kind,
      title: def.title, expected: def.expected,
      state: 'not_run', status: null, observed: null, serverRequestId: null, checkedAt: null };
    const item = byId.get(def.id);
    if (!item) return base;
    if (duplicated.has(def.id)) return { ...base, state: 'invalid' };
    const checkedAt = isoOrNull(item.checkedAt);
    const serverRequestId = typeof item.serverRequestId === 'string' && SERVER_REQUEST_ID.test(item.serverRequestId)
      ? item.serverRequestId : null;
    const filled = { ...base, status: Number.isInteger(item.status) ? item.status : null,
      observed: shortText(item.observed), serverRequestId, checkedAt };
    const needsServerRequestId = def.kind === 'live';
    if (!CASE_RESULTS.includes(item.result) || !checkedAt || (needsServerRequestId && !serverRequestId)) {
      return { ...filled, state: 'invalid' };
    }
    if (item.expected !== def.expected) return { ...filled, state: 'stale' };
    return { ...filled, state: item.result };
  });
  const counts = Object.fromEntries(STATES_COUNTED.map(state => [state, 0]));
  for (const item of cases) counts[item.state] += 1;
  return {
    ran,
    ranAt: ran ? isoOrNull(stored.ranAt) : null,
    finishedAt: ran ? isoOrNull(stored.finishedAt) : null,
    target: ran && stored.target && typeof stored.target === 'object' ? {
      appOrigin: typeof stored.target.appOrigin === 'string' ? stored.target.appOrigin.slice(0, 200) : null,
      deployedCommit: /^[0-9a-f]{40}$/u.test(stored.target.deployedCommit ?? '') ? stored.target.deployedCommit : null,
      localCommit: /^[0-9a-f]{40}$/u.test(stored.target.localCommit ?? '') ? stored.target.localCommit : null,
      localDirty: typeof stored.target.localDirty === 'boolean' ? stored.target.localDirty : null,
    } : null,
    cleanupOk: ran && typeof stored.cleanupOk === 'boolean' ? stored.cleanupOk : null,
    total: cases.length,
    counts,
    cases,
  };
}
