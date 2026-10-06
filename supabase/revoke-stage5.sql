-- 5단계: public.notes 를 브라우저·공개 키에서 직접 읽고 쓰지 못하게 닫습니다.
-- 서버 함수는 서버 전용 키(service_role)로 접속하므로 이 SQL과 상관없이 계속 동작합니다.
-- 다른 표는 건드리지 않습니다. 학습용 Supabase의 SQL Editor에서 한 번 실행합니다.
alter table public.notes enable row level security;
revoke all on table public.notes from public, anon, authenticated;
