-- 읽기만 합니다. 적용 전·후에 각각 실행해 결과를 비교합니다.
-- 적용 후 기대값: grant 행에 PUBLIC/anon/authenticated 없음,
--                 has_privilege 행은 anon·authenticated 모두 false, service_role 은 모두 true.
select 'grant' as kind, grantee::text as who, privilege_type::text as what, 'yes' as value
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
union all
select 'has_privilege', r.role_name, p.privilege,
       has_table_privilege(r.role_name, 'public.notes', p.privilege)::text
from (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege)
order by 1, 2, 3;
