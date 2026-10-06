-- 4단계: notes 표의 행 수준 보안(RLS)과 최소 권한.
-- 먼저 rls-stage4-check.sql로 현재 상태를 보고, 이 파일을 실행한 뒤 다시 점검합니다.
-- 서버 함수(서버 전용 키)는 RLS를 우회하므로 이 SQL은 서버 동작을 바꾸지 않습니다.
-- 이 SQL은 브라우저가 공개 키로 Data API를 직접 부를 때를 위한 두 번째 방어선입니다.
alter table public.notes enable row level security;

revoke all on table public.notes from public, anon, authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

create policy notes_select_own on public.notes
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy notes_insert_own on public.notes
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy notes_update_own on public.notes
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy notes_delete_own on public.notes
  for delete to authenticated using ((select auth.uid()) = owner_id);
