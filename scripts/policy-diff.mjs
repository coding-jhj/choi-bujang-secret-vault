// Policy diff (step 10, build 1).
// Shows the version to restore and the change scope BEFORE any restore action runs
// ("복원할 버전과 변경 범위가 실행 전에 보여야 합니다").
//
// "Policy" here means exactly three non-secret values:
//   - RULE_IDS exported by src/decider.mjs
//   - aleph.config.json allowedRoutes
//   - aleph.config.json identityProvider
// Live Supabase RLS / revoke state is NOT covered; that stays student-run SQL.
//
// The committed snapshot backups/policy-snapshot.json is the verified-safe reference.
// Its sha256 field is self-verifying and computed like this (computeSnapshotHash):
//   1. Take the snapshot object WITHOUT the sha256 field
//      ({ capturedAt, ruleIds, allowedRoutes, identityProvider }).
//   2. Serialize it canonically (canonicalJson): object keys sorted by UTF-16 code unit
//      order (Array.prototype.sort default), at every depth; arrays keep their order;
//      no whitespace; strings/numbers/booleans/null use JSON.stringify.
//   3. SHA-256 over the UTF-8 bytes of that string, lowercase hex.
// The hash detects corruption and accidental edits. It is NOT a signature: anyone who can
// edit the file can recompute it. The trust anchor for the snapshot is the git history.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_IDS } from '../src/decider.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_SNAPSHOT_PATH = join(ROOT, 'backups', 'policy-snapshot.json');
export const DEFAULT_CONFIG_PATH = join(ROOT, 'aleph.config.json');

const SNAPSHOT_KEYS = 'allowedRoutes,capturedAt,identityProvider,ruleIds,sha256';
const IDP_KEYS = 'audience,issuer,jwksUrl';
const HEX64 = /^[0-9a-f]{64}$/u;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === 'string');
const isIdentityProvider = value => isPlainObject(value)
  && Object.keys(value).sort().join(',') === IDP_KEYS
  && Object.values(value).every(item => typeof item === 'string' && item.trim() !== '');

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeSnapshotHash(snapshot) {
  const { sha256: _ignored, ...body } = snapshot;
  return createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex');
}

// Throws an Error with a Korean message when the snapshot is missing, unparseable,
// wrongly shaped or its hash does not match. Callers must stop on any throw.
export function loadVerifiedSnapshot(snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  let text;
  try { text = readFileSync(snapshotPath, 'utf8'); } catch {
    throw new Error(`검증된 정책 사본이 없습니다: ${snapshotPath}`);
  }
  let snapshot;
  try { snapshot = JSON.parse(text); } catch {
    throw new Error('정책 사본을 JSON으로 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.');
  }
  if (!isPlainObject(snapshot) || Object.keys(snapshot).sort().join(',') !== SNAPSHOT_KEYS
      || typeof snapshot.capturedAt !== 'string' || Number.isNaN(Date.parse(snapshot.capturedAt))
      || !isStringArray(snapshot.ruleIds) || !isStringArray(snapshot.allowedRoutes)
      || !isIdentityProvider(snapshot.identityProvider)
      || typeof snapshot.sha256 !== 'string' || !HEX64.test(snapshot.sha256)) {
    throw new Error('정책 사본의 형식이 맞지 않습니다. 검증할 수 없으므로 중단합니다.');
  }
  if (computeSnapshotHash(snapshot) !== snapshot.sha256) {
    throw new Error('정책 사본의 해시가 맞지 않습니다. 사본이 바뀌었거나 손상되었으므로 중단합니다.');
  }
  return snapshot;
}

// Reads the CURRENT policy fresh from disk (not from an import cache).
export function loadCurrentPolicy({ configPath = DEFAULT_CONFIG_PATH, ruleIds = RULE_IDS } = {}) {
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch {
    throw new Error(`현재 설정 파일을 읽을 수 없습니다: ${configPath}`);
  }
  if (!isPlainObject(config)) throw new Error('현재 설정 파일의 형식이 맞지 않습니다.');
  return {
    ruleIds: [...ruleIds],
    allowedRoutes: Array.isArray(config.allowedRoutes) ? [...config.allowedRoutes] : [],
    identityProvider: isPlainObject(config.identityProvider) ? { ...config.identityProvider } : {},
  };
}

// Set difference only: order changes and duplicates are not reported as differences.
const setDiff = (snapshotList, currentList) => ({
  added: currentList.filter(item => !snapshotList.includes(item)),
  removed: snapshotList.filter(item => !currentList.includes(item)),
});

export function diffPolicy(snapshot, current) {
  const fields = [...new Set([...Object.keys(snapshot.identityProvider), ...Object.keys(current.identityProvider)])].sort();
  return {
    ruleIds: setDiff(snapshot.ruleIds, current.ruleIds),
    allowedRoutes: setDiff(snapshot.allowedRoutes, current.allowedRoutes),
    identityProvider: fields
      .filter(field => snapshot.identityProvider[field] !== current.identityProvider[field])
      .map(field => ({ field, snapshot: snapshot.identityProvider[field], current: current.identityProvider[field] })),
  };
}

export const hasListDiff = part => part.added.length > 0 || part.removed.length > 0;

export function formatDiff(snapshot, diff) {
  const lines = [`복원 기준 사본: ${snapshot.capturedAt} (sha256 ${snapshot.sha256.slice(0, 12)}…)`];
  const list = (title, part) => {
    lines.push(`[${title}]`);
    if (!hasListDiff(part)) { lines.push('  차이 없음'); return; }
    for (const item of part.removed) lines.push(`  - 사본에는 있고 지금은 없음: ${item}`);
    for (const item of part.added) lines.push(`  + 지금만 있음(사본에 없음): ${item}`);
  };
  list('규칙 ID 차이', diff.ruleIds);
  list('허용 경로 차이', diff.allowedRoutes);
  lines.push('[로그인 발급자 정보 차이]');
  if (!diff.identityProvider.length) lines.push('  차이 없음');
  const show = value => (value === undefined ? '(없음)' : JSON.stringify(value));
  for (const { field, snapshot: before, current: now } of diff.identityProvider) {
    lines.push(`  ${field}: 사본 ${show(before)} → 지금 ${show(now)}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const snapshot = loadVerifiedSnapshot();
    const diff = diffPolicy(snapshot, loadCurrentPolicy());
    process.stdout.write(`${formatDiff(snapshot, diff)}\n`);
  } catch (error) {
    process.stderr.write(`정책 비교 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
