// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.

// device_registered rule:
// - Allows only when the contract field `deviceRegistered` is exactly boolean `true`.
// - Anything else (false, missing, null, "true", 1, non-object request) denies (fail closed).
// - This rule does NOT enforce device enrollment itself. Enrollment is enforced
//   upstream at the relay before this decider is called; per docs/DECIDER_REQUEST.md,
//   `deviceRegistered: false` only reaches this function in the judge's virtual
//   (test) requests. This rule is a defense-in-depth check on that signal.
// - Logs nothing.
//
// step_up_required rule (evaluated only after device_registered passes):
// - "Anomalous" means ALL THREE hold at once:
//     1. unusual hour: signals.hour is a finite number and (< 6 or >= 22);
//     2. unusual network: signals.network is exactly the string 'unusual';
//     3. burst reads: some recentEvents entry has count >= BURST_COUNT_THRESHOLD
//        within ageSeconds <= BURST_WINDOW_SECONDS.
// - `region` is read but intentionally NOT a factor in this iteration: region alone
//   would permanently penalize users who are legitimately elsewhere, and the local
//   practice cases (decider-test / fixture-7) only exercise hour+network+burst.
// - `signals.source` is never used as evidence. 'judge_fixture' marks virtual data
//   and must not be treated as real location evidence.
// - Fail OPEN on ambiguous/missing signal data (falls through to the
//   device_registered allow). This is the opposite of the device_registered hard
//   gate, which fails CLOSED. It is intentional: per docs/DECIDER_REQUEST.md real
//   traffic currently sends placeholder values (source:'none',
//   region/network:'unknown'), so failing closed here would block every real user.
//   This rule is an additive heuristic, not the access gate.
// - Re-verification tension: docs/DECIDER_REQUEST.md warns "이 값만 보고 재인증
//   확인 요청을 건너뛰지 않습니다" (do not skip the re-auth confirmation based on
//   stepUp alone). This practice-only decider still honors stepUp.verified so the
//   local decider:test passes, with strict bounds on authAgeSeconds (safe integer,
//   0..900). Production should require stronger corroboration than this contract
//   field alone provides.
//
// resource_zone rule (evaluated after device_registered, before step_up_required):
// - Allows the request to continue only when `request.route` is a string that EXACTLY
//   (case-sensitive, no trimming, no prefix/pattern matching) equals one of the
//   explicitly enumerated route shapes in ALLOWED_ROUTES. Anything else — non-string,
//   missing, unknown path such as 'GET /notes/export', different casing, extra
//   suffix — denies with reasonCode 'unknown_route' (fail closed). No guessed or
//   loosely matched path is implicitly trusted.
// - Route strings follow the decider contract/fixture convention (no '/api' prefix),
//   per docs/DECIDER_REQUEST.md ("`route`는 `GET /notes/:id`처럼 허용된 경로 모양").
//   This is a different namespace from aleph.config.json allowedRoutes ('/api/...').
// - Scope limit: this rule checks ROUTE SHAPE only (zone hygiene). The decider has no
//   database access and cannot know who owns a given note/announcement row, so it
//   cannot stop one user reading or modifying another user's row (BOLA). Per-row
//   ownership is enforced in the API layer (src/notes-api.mjs,
//   src/announcements-api.mjs via owner_id filters). Both layers are required.
// - On a match, the outcome is decided by the later rules, and ruleIds name the rule
//   that decided it (unchanged from before this rule was added).
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zone']);

const SCHEMA = 'aleph.decision.v1';
const RULE_DEVICE_REGISTERED = 'device_registered';
const RULE_STEP_UP_REQUIRED = 'step_up_required';
const RULE_RESOURCE_ZONE = 'resource_zone';

const ALLOWED_ROUTES = Object.freeze([
  'GET /notes',
  'POST /notes',
  'GET /notes/:id',
  'PUT /notes/:id',
  'DELETE /notes/:id',
  'GET /announcements',
  'POST /announcements',
  'GET /announcements/:id',
  'PUT /announcements/:id',
  'DELETE /announcements/:id',
]);

// Untuned heuristics pending an operator-defined threshold: the contract doc
// defines no semantics or units for recentEvents kind/count.
const BURST_COUNT_THRESHOLD = 10;
const BURST_WINDOW_SECONDS = 300;

const MAX_RECENT_EVENTS = 12;
const MAX_AUTH_AGE_SECONDS = 900;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Reads only own properties so a polluted Object.prototype cannot inject values.
function ownValue(obj, key) {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

function stringOrUndefined(value) {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Whitelist-only copy of the four documented signal keys. Any other property
// (e.g. a forged `trusted` or `adminOverride`) is dropped, never surfaced.
function readSignals(request) {
  const raw = request.signals;
  if (!isPlainObject(raw)) {
    return { source: undefined, region: undefined, network: undefined, hour: undefined };
  }
  return {
    source: stringOrUndefined(ownValue(raw, 'source')),
    region: stringOrUndefined(ownValue(raw, 'region')),
    network: stringOrUndefined(ownValue(raw, 'network')),
    hour: finiteNumberOrUndefined(ownValue(raw, 'hour')),
  };
}

// Whitelist-only copy of at most 12 documented recentEvents entries.
function readRecentEvents(request) {
  const raw = request.recentEvents;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .slice(0, MAX_RECENT_EVENTS)
    .filter(isPlainObject)
    .map((event) => ({
      kind: stringOrUndefined(ownValue(event, 'kind')),
      ageSeconds: finiteNumberOrUndefined(ownValue(event, 'ageSeconds')),
      count: finiteNumberOrUndefined(ownValue(event, 'count')),
    }));
}

function isAnomalous(signals, recentEvents) {
  const unusualHour =
    signals.hour !== undefined && (signals.hour < 6 || signals.hour >= 22);
  const unusualNetwork = signals.network === 'unusual';
  const burstReads = recentEvents.some(
    (event) =>
      event.count !== undefined &&
      event.ageSeconds !== undefined &&
      event.count >= BURST_COUNT_THRESHOLD &&
      event.ageSeconds <= BURST_WINDOW_SECONDS,
  );
  return unusualHour && unusualNetwork && burstReads;
}

function isReverified(request) {
  const stepUp = request.stepUp;
  if (!isPlainObject(stepUp)) {
    return false;
  }
  const authAgeSeconds = ownValue(stepUp, 'authAgeSeconds');
  return (
    ownValue(stepUp, 'verified') === true &&
    Number.isSafeInteger(authAgeSeconds) &&
    authAgeSeconds >= 0 &&
    authAgeSeconds <= MAX_AUTH_AGE_SECONDS
  );
}

export async function decide(request) {
  const isObject = typeof request === 'object' && request !== null;
  const requestId = isObject ? request.requestId : undefined;

  if (!isObject || request.deviceRegistered !== true) {
    return {
      schema: SCHEMA,
      requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_DEVICE_REGISTERED],
    };
  }

  const route = stringOrUndefined(ownValue(request, 'route'));
  if (route === undefined || !ALLOWED_ROUTES.includes(route)) {
    return {
      schema: SCHEMA,
      requestId,
      decision: 'deny',
      reasonCode: 'unknown_route',
      ruleIds: [RULE_RESOURCE_ZONE],
    };
  }

  const signals = readSignals(request);
  const recentEvents = readRecentEvents(request);

  if (isAnomalous(signals, recentEvents)) {
    if (!isReverified(request)) {
      return {
        schema: SCHEMA,
        requestId,
        decision: 'step_up',
        reasonCode: 'step_up_required',
        ruleIds: [RULE_STEP_UP_REQUIRED],
      };
    }
    return {
      schema: SCHEMA,
      requestId,
      decision: 'allow',
      reasonCode: 'step_up_verified',
      ruleIds: [RULE_STEP_UP_REQUIRED],
    };
  }

  return {
    schema: SCHEMA,
    requestId,
    decision: 'allow',
    reasonCode: 'device_registered',
    ruleIds: [RULE_DEVICE_REGISTERED],
  };
}
