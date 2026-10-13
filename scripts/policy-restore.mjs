// Policy restore (step 10, build 2).
// Restores aleph.config.json allowedRoutes and identityProvider from the verified snapshot
// backups/policy-snapshot.json. Default is a dry run: it prints what WILL change and writes
// nothing. Only `node scripts/policy-restore.mjs --confirm` writes.
//
// Scope, stated narrowly on purpose:
//   - Only the two config values are restorable here; they are plain data.
//   - RULE_IDS in src/decider.mjs is source code. This script never rewrites it; it only
//     prints a note to revert it with git.
//   - Owner-scoped access in src/notes-api.mjs (B is denied A's notes, A keeps access to A's
//     own notes; unchanged since step 4) does NOT read allowedRoutes or identityProvider for
//     its owner_id filtering, so no drift this script could see or undo could have broken it.
//     That card check ("B의 A 자료 요청은 다시 거부되고 A 정상 요청은 유지되어야 합니다") is a
//     separate concern verified separately; this script does not claim to fix it.
//   - Live Supabase RLS / revoke state is not touched (student-run SQL, as in steps 2-8).
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CONFIG_PATH, DEFAULT_SNAPSHOT_PATH, diffPolicy, formatDiff, hasListDiff,
  loadCurrentPolicy, loadVerifiedSnapshot,
} from './policy-diff.mjs';
import { RULE_IDS } from '../src/decider.mjs';

const RULE_NOTE = 'src/decider.mjs의 RULE_IDS는 소스 코드이므로 이 스크립트가 자동으로 되돌리지 않습니다. git으로 직접 되돌리세요.';

// Rewrites only allowedRoutes and identityProvider; every other key keeps its value and position.
// Keeps 2-space indentation and the file's existing line ending (CRLF or LF) and final newline.
function writeConfig(configPath, snapshot) {
  const raw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('현재 설정 파일의 형식이 맞지 않습니다.');
  config.allowedRoutes = [...snapshot.allowedRoutes];
  config.identityProvider = { ...snapshot.identityProvider };
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const trailing = /\r?\n$/u.test(raw) ? eol : '';
  const text = JSON.stringify(config, null, 2).replaceAll('\n', eol) + trailing;
  const temp = `${configPath}.restore-tmp`;
  writeFileSync(temp, text, 'utf8');
  renameSync(temp, configPath); // replace in one step so a crash never leaves a half-written config
}

export function restorePolicy({
  snapshotPath = DEFAULT_SNAPSHOT_PATH, configPath = DEFAULT_CONFIG_PATH, ruleIds = RULE_IDS, confirm = false,
} = {}) {
  const snapshot = loadVerifiedSnapshot(snapshotPath); // throws and stops on missing/invalid/hash mismatch
  const diff = diffPolicy(snapshot, loadCurrentPolicy({ configPath, ruleIds }));
  const configDrift = hasListDiff(diff.allowedRoutes) || diff.identityProvider.length > 0;
  const lines = [formatDiff(snapshot, diff)];
  if (hasListDiff(diff.ruleIds)) lines.push(`참고: ${RULE_NOTE}`);
  let written = false;
  if (!configDrift) {
    lines.push('aleph.config.json에서 되돌릴 차이가 없습니다. 아무것도 쓰지 않았습니다.');
  } else if (!confirm) {
    lines.push('미리보기만 했습니다. 위 허용 경로·로그인 발급자 정보를 사본 값으로 되돌리려면 --confirm을 붙여 다시 실행하세요.');
  } else {
    writeConfig(configPath, snapshot);
    const after = diffPolicy(snapshot, loadCurrentPolicy({ configPath, ruleIds }));
    if (hasListDiff(after.allowedRoutes) || after.identityProvider.length > 0) {
      throw new Error('되돌린 뒤 다시 비교했지만 차이가 남아 있습니다. aleph.config.json을 직접 확인하세요.');
    }
    written = true;
    lines.push('aleph.config.json의 허용 경로와 로그인 발급자 정보를 사본 값으로 되돌렸습니다. 다른 항목은 그대로입니다.');
  }
  return { diff, configDrift, written, output: lines.join('\n') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = restorePolicy({ confirm: process.argv.includes('--confirm') });
    process.stdout.write(`${result.output}\n`);
  } catch (error) {
    process.stderr.write(`정책 복원 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
