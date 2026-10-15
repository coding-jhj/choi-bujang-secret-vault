-- 학습용 기기 승인(device_approvals) 테이블. 실제 개인정보·비밀번호·연락처는 넣지 않습니다.
-- notes·announcements·notes_backup·restore_audit과 별개인 새 테이블입니다. Supabase SQL Editor에서 한 번만 실행하세요.
-- 한 행은 "어떤 사용자(owner_id)의 어떤 기기(device_id)"의 승인 상태 하나입니다.
-- device_id는 브라우저가 처음 한 번 만든 임의 식별자(비밀 아님)입니다. 기기 키나 토큰이 아닙니다.
-- 서버는 메모·공지·복구 요청마다 이 표를 새로 읽어 status가 정확히 'approved'일 때만 자료를 돌려줍니다.
create table if not exists public.device_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (owner_id, device_id)
);

alter table public.device_approvals enable row level security;

-- 브라우저용 역할(anon, authenticated)에는 권한을 주지 않습니다.
-- 읽기·쓰기는 Vercel 서버 함수가 서버 전용 키로만 합니다. (notes_backup·restore_audit과 같은 방식입니다.)
revoke all on table public.device_approvals from anon, authenticated;

-- 승인 흐름(수동 승인):
-- 1) 화면의 "승인 요청" 버튼 → POST /api/devices/request → 서버가 status='pending' 행을 만듭니다.
--    같은 기기가 다시 요청해도 기존 행은 바뀌지 않습니다(approved를 pending으로 되돌리거나
--    revoked를 풀 수 없음). 요청 본문에 status를 넣어도 서버는 읽지 않습니다.
-- 2) 학생이 이 SQL Editor에서 직접 승인합니다. HTTP 경로로는 승인할 수 없습니다.
--    먼저 대기 중인 요청을 확인하세요(자기 계정의 owner_id와 화면에 보이는 기기 번호 끝자리로 고릅니다):
--   select id, owner_id, device_id, status, requested_at from public.device_approvals
--   where status = 'pending' order by requested_at desc;
--    그다음 고른 한 행만 승인합니다(<행 id>를 위 결과의 id로 바꿉니다):
--   update public.device_approvals set status = 'approved', approved_at = now()
--   where id = '<행 id>' and status = 'pending';
-- 3) 기기를 잃어버렸거나 의심되면 회수합니다. 다음 요청부터 바로 거부됩니다(서버가 캐시하지 않음):
--   update public.device_approvals set status = 'revoked' where id = '<행 id>';
