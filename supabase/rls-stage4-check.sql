-- 읽기만 합니다. 아무것도 바꾸지 않습니다. 적용 전과 적용 후에 각각 실행해 결과를 비교합니다.
select 'grant' as kind, grantee::text as who, privilege_type::text as detail
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
union all
select 'rls', 'notes', case when relrowsecurity then 'on' else 'off' end
from pg_class where oid = 'public.notes'::regclass
union all
select 'policy', policyname::text, cmd::text
from pg_policies where schemaname = 'public' and tablename = 'notes'
union all
select 'can_' || r, 'select/insert/update/delete',
  concat_ws('/',
    has_table_privilege(r, 'public.notes', 'select')::text,
    has_table_privilege(r, 'public.notes', 'insert')::text,
    has_table_privilege(r, 'public.notes', 'update')::text,
    has_table_privilege(r, 'public.notes', 'delete')::text)
from unnest(array['anon', 'authenticated']) as r
order by 1, 2, 3;
