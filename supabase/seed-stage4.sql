-- 4단계 시험용: 기존 가상 메모를 A 계정에, 가상 메모 1건을 B 계정에 연결합니다.
-- A = 가장 먼저 만든 계정, B = 가장 나중에 만든 계정. 이메일은 쓰지 않습니다.
-- Supabase 대시보드 SQL Editor에서 실행합니다. 다시 실행해도 B 메모는 1건만 유지됩니다.
do $$
declare
  a uuid;
  b uuid;
  n int;
begin
  select count(*) into n from auth.users;
  if n <> 2 then
    raise exception '사용자가 2명이 아닙니다(현재 %명). 중단합니다.', n;
  end if;

  select id into a from auth.users order by created_at asc limit 1;
  select id into b from auth.users order by created_at desc limit 1;

  update public.notes set owner_id = a where owner_id <> b;

  insert into public.notes (owner_id, title, content)
  select b, 'B 계정 가상 메모', '4단계 시험용 가상 메모입니다. 실제 정보가 아닙니다.'
  where not exists (
    select 1 from public.notes where owner_id = b and title = 'B 계정 가상 메모'
  );
end $$;

-- 확인: 계정별 메모 수 (A는 기존 메모 수, B는 1이어야 합니다)
select u.email, count(n.id) as notes
from auth.users u
left join public.notes n on n.owner_id = u.id
group by u.email, u.created_at
order by u.created_at;
