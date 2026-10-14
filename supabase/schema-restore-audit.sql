-- 학습용 복구 감사 기록(restore_audit) 테이블. 실제 개인정보·비밀번호·연락처는 넣지 않습니다.
-- notes·notes_backup과 별개인 새 테이블입니다. Supabase SQL Editor에서 한 번만 실행하세요.
-- 한 행은 복구 한 건입니다. 누가(owner_id) 어떤 메모를(note_id) 어떤 백업 행에서(restored_backup_id)
-- 언제(restored_at) 되살렸는지만 적습니다. 메모 내용이나 비밀 값은 넣지 않습니다.
-- 서버는 복구가 성공한 뒤 이 표에 한 행을 추가하기만 하고, 고치거나 지우지 않습니다.
create table if not exists public.restore_audit (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null,
  owner_id uuid not null,
  restored_backup_id uuid not null,
  restored_at timestamptz not null default now()
);

alter table public.restore_audit enable row level security;

-- 브라우저용 역할(anon, authenticated)에는 권한을 주지 않습니다.
-- 쓰기는 Vercel 서버 함수가 서버 전용 키로만 합니다. (notes·announcements·notes_backup과 같은 방식입니다.)
revoke all on table public.restore_audit from anon, authenticated;
