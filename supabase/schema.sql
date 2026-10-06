-- 학습용 Supabase 테이블. 실제 개인정보·비밀번호·연락처는 넣지 않습니다.
-- 새로 만들 때만 실행합니다. 2단계에서 이미 만든 표는 migrate-stage3.sql을 실행하세요.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

-- 브라우저용 역할(anon, authenticated)에는 권한을 주지 않습니다.
-- 읽기·쓰기는 Vercel 서버 함수가 서버 전용 키로만 합니다.
revoke all on table public.notes from anon, authenticated;
