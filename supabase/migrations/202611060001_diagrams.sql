-- ERD 원문을 문서로 저장하며, ERD 안에 정의한 테이블을 실제로 생성하지 않습니다.
create table public.diagrams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled diagram' check (char_length(title) between 1 and 200),
  dbml text not null default '',
  layout jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index diagrams_owner_updated_idx on public.diagrams(owner_id, updated_at desc);
alter table public.diagrams enable row level security;
create policy "Read own diagrams" on public.diagrams for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Create own diagrams" on public.diagrams for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Update own diagrams" on public.diagrams for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Delete own diagrams" on public.diagrams for delete to authenticated using ((select auth.uid()) = owner_id);
create function public.touch_diagram() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;
create trigger touch_diagram before update on public.diagrams for each row execute function public.touch_diagram();
