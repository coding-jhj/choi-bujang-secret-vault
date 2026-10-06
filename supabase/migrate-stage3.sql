-- 2단계에서 만든 notes 표의 id를 숫자에서 UUID로 바꿉니다. 기존 메모는 그대로 남고 id만 새로 붙습니다.
alter table public.notes alter column id drop identity if exists;
alter table public.notes alter column id type uuid using gen_random_uuid();
alter table public.notes alter column id set default gen_random_uuid();
