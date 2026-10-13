-- 학습용 공지(announcements) 테이블. 실제 개인정보·비밀번호·연락처는 넣지 않습니다.
-- notes와 별개인 새 테이블입니다. Supabase SQL Editor에서 한 번만 실행하세요.
-- 여기서 "강사"는 별도 역할이 아니라, 공지 한 건(행)의 owner_id 주인을 뜻합니다.
-- 역할 칸은 일부러 두지 않습니다. 공지를 만든 사람만 그 공지를 읽고·고치고·지울 수 있습니다.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- 브라우저용 역할(anon, authenticated)에는 권한을 주지 않습니다.
-- 읽기·쓰기는 Vercel 서버 함수가 서버 전용 키로만 합니다. (notes의 5단계 이후 상태와 같습니다.)
revoke all on table public.announcements from anon, authenticated;
