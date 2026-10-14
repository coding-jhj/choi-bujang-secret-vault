// Policy check (step 10, build 1).
// "Policy" in this repository means the Supabase RLS POLICY objects on public.notes,
// defined since step 4 in supabase/rls-stage4.sql (notes_select_own, notes_insert_own,
// notes_update_own, notes_delete_own). Those policies are what deny B's request for A's
// notes while keeping A's own requests working.
//
// This script shows the version to restore and the change scope BEFORE any restore runs
// ("복원할 버전과 변경 범위가 실행 전에 보여야 합니다"). It never connects to Supabase and
// never runs SQL: the live state is checked by the student with supabase/rls-stage4-check.sql.
//
// Trust root: the reference copy is trusted only if the working-tree file is identical to
// what is committed at git HEAD. Identity is checked with git's own blob hash
// (`git hash-object` vs `git rev-parse HEAD:<path>`), i.e. the same rule `git status` uses.
// A raw byte compare would be wrong here: with core.autocrlf=true the working copy has CRLF
// line endings while the committed blob has LF, so an unmodified file would look "changed".
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_SNAPSHOT_PATH = 'supabase/rls-stage4.sql';
export const CHECK_SQL_PATH = 'supabase/rls-stage4-check.sql';

const git = args => execFileSync('git', args, {
  cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

// Throws an Error with a Korean message when the copy is missing, not committed, differs
// from HEAD, or does not look like the expected policy file. Callers must stop on any throw.
export function verifySnapshot(snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  if (!existsSync(join(ROOT, snapshotPath))) {
    throw new Error(`복원 기준 사본이 없습니다: ${snapshotPath}`);
  }
  let headBlob;
  let workBlob;
  let text;
  try {
    headBlob = git(['rev-parse', '--verify', '--quiet', `HEAD:${snapshotPath}`]).trim();
    workBlob = git(['hash-object', '--', snapshotPath]).trim();
    text = git(['show', `HEAD:${snapshotPath}`]);
  } catch {
    throw new Error(`git HEAD에서 ${snapshotPath}를 찾을 수 없습니다(커밋되지 않았거나 git 저장소가 아님). 검증할 수 없으므로 중단합니다.`);
  }
  if (!headBlob || headBlob !== workBlob) {
    throw new Error(`${snapshotPath}가 git HEAD에 커밋된 내용과 다릅니다. 검증 실패이므로 중단합니다. (git diff -- ${snapshotPath}로 차이를 확인하세요.)`);
  }

  const policies = [...text.matchAll(/^create policy (\S+) on public\.(\w+)\s+for (\w+)/gmi)]
    .map(([, name, table, cmd]) => ({ name, table, cmd: cmd.toLowerCase() }));
  const statements = text.split(/\r?\n/u)
    .filter(line => /^(alter table|revoke|grant)\s/iu.test(line)).map(line => line.trim());
  const tables = [...new Set([...text.matchAll(/\bpublic\.(\w+)/gu)].map(match => match[1]))].sort();
  if (policies.length === 0) {
    throw new Error(`${snapshotPath}에서 create policy 문장을 찾지 못했습니다. 검증할 수 없으므로 중단합니다.`);
  }

  let lastCommit = '';
  try { lastCommit = git(['log', '-1', '--format=%h %s', '--', snapshotPath]).trim(); } catch { /* optional */ }
  return { path: snapshotPath, blob: headBlob, lastCommit, policies, statements, tables };
}

export function formatCheck(snapshot) {
  return [
    `복원 기준: ${snapshot.path} (git HEAD와 일치 확인됨)`,
    `  blob ${snapshot.blob.slice(0, 12)}${snapshot.lastCommit ? ` · 마지막 변경 커밋: ${snapshot.lastCommit}` : ''}`,
    `기대하는 정책 ${snapshot.policies.length}개: ${snapshot.policies.map(policy => policy.name).join(', ')}`,
    ...snapshot.policies.map(policy => `  - ${policy.name}: public.${policy.table} · cmd=${policy.cmd}`),
    '',
    `지금 실제 Supabase에 적용된 정책을 보려면 ${CHECK_SQL_PATH}을 SQL Editor에서 실행하세요.`,
    `결과에 위 ${snapshot.policies.length}개 정책 이름이 전부 있고, 각 cmd(select/insert/update/delete)가 올바르면 차이가 없는 것입니다.`,
    '이 스크립트는 Supabase에 접속하지 않습니다. 로컬 기준 사본의 무결성만 확인합니다.',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${formatCheck(verifySnapshot())}\n`);
  } catch (error) {
    process.stderr.write(`정책 점검 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
