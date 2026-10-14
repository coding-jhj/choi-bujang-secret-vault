// Policy restore plan (step 10, build 2).
// Prints the restore procedure for the notes RLS policies and what WILL change, before
// anything runs ("실행 전에 바뀔 항목을 확인하게 해 줘"). Informational only: it never runs
// SQL and never connects to Supabase. The student runs supabase/rls-stage4.sql in the
// Supabase SQL Editor, exactly as in step 4.
//
// Whether B's request for A's notes is denied again and A's own request still works must be
// confirmed by re-running supabase/rls-stage4-check.sql and, if needed, with two real
// accounts. The coding tool cannot do that two-account live test (same reason as step 4).
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_SQL_PATH, verifySnapshot } from './policy-check.mjs';

export function formatRestorePlan(snapshot) {
  const others = ['announcements', 'notes_backup'];
  const touched = snapshot.tables.map(table => `public.${table}`).join(', ');
  return [
    `복원 기준: ${snapshot.path} (git HEAD와 일치 확인됨, blob ${snapshot.blob.slice(0, 12)})`,
    '',
    `정책을 되돌리려면 Supabase SQL Editor에서 ${snapshot.path}을 다시 실행하세요.`,
    '이 파일은 drop policy if exists 뒤에 다시 만들기 때문에 몇 번 실행해도 안전합니다.',
    '',
    '실행 전 바뀔 항목:',
    ...snapshot.policies.map(policy => `  - 정책 ${policy.name} (public.${policy.table}, cmd=${policy.cmd}): 지우고 같은 정의로 다시 만듦`),
    ...snapshot.statements.map(statement => `  - 권한·RLS 문장: ${statement}`),
    '',
    `이 SQL이 건드리는 표: ${touched} (파일 안 public.* 이름을 전부 세어 확인함)`,
    `기존 notes 표의 행(데이터)이나 다른 표(${others.join(', ')})는 이 SQL이 건드리지 않습니다.`,
    '',
    `B의 A 자료 요청이 다시 거부되는지, A 정상 요청은 유지되는지는 ${CHECK_SQL_PATH} 재실행 결과와,`,
    '필요하면 두 계정으로 직접 확인하세요 (학생 본인 2계정 라이브 테스트는 이 저장소의 코딩 도구가',
    '대신 할 수 없습니다 — 4단계 때와 같은 이유).',
    '이 스크립트는 SQL을 실행하지 않고 Supabase에 접속하지 않습니다.',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const snapshot = verifySnapshot();
    const outside = snapshot.tables.filter(table => table !== 'notes');
    if (outside.length) {
      throw new Error(`기준 SQL이 notes 밖의 표(${outside.join(', ')})를 건드립니다. 범위가 예상과 달라 중단합니다.`);
    }
    process.stdout.write(`${formatRestorePlan(snapshot)}\n`);
  } catch (error) {
    process.stderr.write(`정책 복원 안내 중단: ${error.message}\n`);
    process.exitCode = 1;
  }
}
