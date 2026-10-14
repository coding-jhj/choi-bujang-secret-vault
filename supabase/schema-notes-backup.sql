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

-- 백업 행은 이제 서버가 자동으로 만듭니다: POST /api/notes로 메모가 새로 생길 때 한 번만,
-- 데이터베이스에 실제로 저장된 값으로 사본을 만듭니다(src/notes-api.mjs).
-- PUT(수정)·DELETE(삭제)는 이 표를 건드리지 않습니다. 변조하는 수정이 사본까지 덮어쓰면
-- "침해 전에 검증한 사본"이 사라지기 때문입니다.
--
-- 남는 빈틈: 이 변경 전에 이미 있던 메모에는 사본이 없습니다(복구 요청은 404).
-- 그런 메모만 골라 한 번 채우는 예시입니다(필요할 때 학생이 직접 실행).
-- 반드시 지금 메모 내용이 변조되지 않았다고 확인한 뒤에 실행하세요. 이미 사본이 있는 메모는
-- 건너뛰므로(not exists), 다시 실행해도 기존 사본을 지금 내용으로 덮지 않습니다.
-- digest()는 pgcrypto 확장 기능입니다. Supabase는 보통 기본으로 켜 두지만, 먼저 아래로 확인하세요.
--   select * from pg_extension where extname = 'pgcrypto';
-- 결과가 비어 있으면 아래 한 줄의 주석을 풀고 먼저 실행하세요.
-- create extension if not exists pgcrypto;
-- (Supabase에서 digest()를 못 찾는다는 오류가 나면 extensions.digest(...)로 바꿔 실행하세요.)
-- insert into public.notes_backup (source_note_id, owner_id, title, content, content_sha256)
-- select n.id, n.owner_id, n.title, n.content, encode(digest(n.content, 'sha256'), 'hex')
-- from public.notes n
-- where not exists (select 1 from public.notes_backup b where b.source_note_id = n.id);
