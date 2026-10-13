// 9단계에서 학생이 채우는 탐지 함수입니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
//
// Input hygiene (step-9 card): this step requires reading ONLY the pseudonymous user,
// device, request type and verdict of each event, and never storing or printing note
// content, tokens or real names. `readEvent()` below is the single enforcement point for
// that: every rule works on its whitelist-only output, the raw event object is never
// spread, copied, stored, logged or returned, and any other property is silently dropped.
// No region/location field is read at all ("지역 하나만으로 확정하지 말고").
//
// Field-name caveat: docs/DETECT_EVENTS.md documents only `at`, `method`, `identity.sub`
// (local-practice shape). `deviceId`, `decision` and `network` / `signals.network` are
// best-evidence GUESSES borrowed from the decider contract (docs/DECIDER_REQUEST.md
// `deviceId`, `signals.network`; decide() output `decision`). They are unverified against
// the real judge/engine event shape and may need to change.

// burst_read (docs/DETECT_EVENTS.md): same identity.sub, GET only, MORE than 120 events
// inside any 10-minute window. Exactly 120 does not trigger.
const BURST_READ_THRESHOLD = 120;
// Window endpoints are inclusive: last.at - first.at <= 600000 ms.
const WINDOW_MS = 10 * 60 * 1000;

// network_volume_anomaly (composite, device-targeted):
// - Untuned heuristic pending an operator-defined threshold, in the same spirit as
//   BURST_COUNT_THRESHOLD in src/decider.mjs: MORE than 15 events of one device inside
//   any 10-minute window, counting every request type (not only GET).
const DEVICE_BURST_THRESHOLD = 15;
// - The only known-safe network baseline. decide() checks `=== 'unusual'`; here any
//   string other than 'usual' counts as a non-baseline signal (more inclusive, e.g. an
//   engine that sends 'vpn' or 'tor'). Missing/non-string network is NOT a signal.
const USUAL_NETWORK = 'usual';
// - This reasonCode is NOT in docs/DETECT_EVENTS.md or any other known registry. It is
//   our own choice and may need to change after the next real grading result.
const REASON_NETWORK_VOLUME = 'network_volume_anomaly';
const REASON_BURST_READ = 'burst_read';

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

function nonEmptyStringOrUndefined(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function dateStringOrUndefined(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
    ? value
    : undefined;
}

// Whitelist-only copy of the six fields detect() may look at. Anything else on the event
// (note body, token, real name, forged flags, ...) never leaves this function.
function readEvent(event) {
  if (!isPlainObject(event)) {
    return {
      subject: undefined, method: undefined, at: undefined,
      device: undefined, decision: undefined, network: undefined,
    };
  }
  const identity = ownValue(event, 'identity');
  const signals = ownValue(event, 'signals');
  const topNetwork = stringOrUndefined(ownValue(event, 'network'));
  const nestedNetwork = isPlainObject(signals)
    ? stringOrUndefined(ownValue(signals, 'network'))
    : undefined;
  return {
    subject: isPlainObject(identity)
      ? nonEmptyStringOrUndefined(ownValue(identity, 'sub'))
      : undefined,
    method: stringOrUndefined(ownValue(event, 'method')),
    at: dateStringOrUndefined(ownValue(event, 'at')),
    device: nonEmptyStringOrUndefined(ownValue(event, 'deviceId')),
    decision: stringOrUndefined(ownValue(event, 'decision')),
    network: topNetwork !== undefined ? topNetwork : nestedNetwork,
  };
}

// Groups entries by `key` in first-appearance order (Map keeps insertion order), so the
// first qualifying group is deterministic by original event order.
function groupBy(entries, key) {
  const groups = new Map();
  for (const entry of entries) {
    const value = entry[key];
    if (value === undefined) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(entry);
  }
  return groups;
}

// True when some window of MORE than `threshold` entries spans <= WINDOW_MS.
// Entries without a valid `at` are dropped (never counted, never thrown on).
function hasBurst(entries, threshold) {
  const times = entries
    .filter((entry) => entry.at !== undefined)
    .map((entry) => new Date(entry.at).getTime())
    .sort((a, b) => a - b);
  let left = 0;
  for (let right = 0; right < times.length; right += 1) {
    while (times[right] - times[left] > WINDOW_MS) left += 1;
    if (right - left + 1 > threshold) return true;
  }
  return false;
}

function findNetworkVolumeDevice(entries) {
  for (const [device, group] of groupBy(entries, 'device')) {
    const unusualNetwork = group.some(
      (entry) => entry.network !== undefined && entry.network !== USUAL_NETWORK,
    );
    if (unusualNetwork && hasBurst(group, DEVICE_BURST_THRESHOLD)) return device;
  }
  return undefined;
}

function findBurstReadSubject(entries) {
  const reads = entries.filter((entry) => entry.method === 'GET');
  for (const [subject, group] of groupBy(reads, 'subject')) {
    if (hasBurst(group, BURST_READ_THRESHOLD)) return subject;
  }
  return undefined;
}

// Decision function only, like decide() in src/decider.mjs: it does NOT call any
// revocation API and does NOT change device permissions. Per the step-9 card, actual
// revocation and elapsed-time measurement are confirmed by the judge sending its own
// virtual events. Returns exactly one object:
//   1. composite device rule -> { action, reasonCode: 'network_volume_anomaly', device }
//   2. burst_read            -> { action, reasonCode: 'burst_read', subject } (unchanged)
//   3. otherwise             -> { action: 'observe' }
export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  // Array.from (not .map) so holes in a sparse array become empty entries, not holes.
  const entries = Array.from(events, (event) => readEvent(event));

  const device = findNetworkVolumeDevice(entries);
  if (device !== undefined) {
    return { action: 'propose_revocation', reasonCode: REASON_NETWORK_VOLUME, device };
  }

  const subject = findBurstReadSubject(entries);
  if (subject !== undefined) {
    return { action: 'propose_revocation', reasonCode: REASON_BURST_READ, subject };
  }

  return { action: 'observe' };
}
