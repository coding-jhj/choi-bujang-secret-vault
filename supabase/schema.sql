-- 학습용 Supabase 테이블. 실제 개인정보·비밀번호·연락처는 넣지 않습니다.
-- Supabase 대시보드의 SQL Editor에서 이 파일을 한 번 실행합니다.
create table if not exists public.notes (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

-- 브라우저용 역할(anon, authenticated)에는 읽기 권한을 주지 않습니다.
-- 읽기는 Vercel 서버 함수가 서버 전용 키로만 합니다.
revoke all on table public.notes from anon, authenticated;
