-- 학습용 메모 백업(notes_backup) 테이블. 실제 개인정보·비밀번호·연락처는 넣지 않습니다.
-- notes와 별개인 새 테이블입니다. Supabase SQL Editor에서 한 번만 실행하세요.
-- 한 행은 메모 한 건의 사본입니다. source_note_id는 원래 메모의 id, owner_id는 그 메모의 주인입니다.
-- content_sha256은 백업할 때의 내용 해시입니다. 되살릴 때 서버가 내용을 다시 해시해 이 값과 대조합니다.
create table if not exists public.notes_backup (
  id uuid primary key default gen_random_uuid(),
  source_note_id uuid not null,
  owner_id uuid not null,
  title text not null,
  content text not null,
  content_sha256 text not null,
  backed_up_at timestamptz not null default now()
);

alter table public.notes_backup enable row level security;

-- 브라우저용 역할(anon, authenticated)에는 권한을 주지 않습니다.
-- 읽기는 Vercel 서버 함수가 서버 전용 키로만 합니다. (notes·announcements와 같은 방식입니다.)
revoke all on table public.notes_backup from anon, authenticated;

-- 예시: 지금 메모 전체를 백업표로 복사(필요할 때 학생이 직접 실행)
-- digest()는 pgcrypto 확장 기능입니다. Supabase는 보통 기본으로 켜 두지만, 먼저 아래로 확인하세요.
--   select * from pg_extension where extname = 'pgcrypto';
-- 결과가 비어 있으면 아래 한 줄의 주석을 풀고 먼저 실행하세요.
-- create extension if not exists pgcrypto;
-- (Supabase에서 digest()를 못 찾는다는 오류가 나면 extensions.digest(...)로 바꿔 실행하세요.)
-- insert into public.notes_backup (source_note_id, owner_id, title, content, content_sha256)
-- select id, owner_id, title, content, encode(digest(content, 'sha256'), 'hex') from public.notes;
