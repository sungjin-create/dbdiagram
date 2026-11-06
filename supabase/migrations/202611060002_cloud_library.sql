-- 202611060001_diagrams.sql 실행 후 한 번 실행하세요.
begin;
create table public.diagram_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  unique (id, owner_id)
);
alter table public.diagram_folders enable row level security;
create policy "Read own folders" on public.diagram_folders for select to authenticated using ((select auth.uid()) = owner_id);

alter table public.diagrams add column folder_id uuid;
alter table public.diagrams add constraint diagrams_folder_owner_fk foreign key (folder_id, owner_id) references public.diagram_folders(id, owner_id);
create index diagrams_folder_idx on public.diagrams(folder_id);

create table public.diagram_library_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0
);
alter table public.diagram_library_state enable row level security;
create policy "Read own library state" on public.diagram_library_state for select to authenticated using ((select auth.uid()) = owner_id);

-- 모든 쓰기는 아래 트랜잭션 함수에서 처리합니다.
revoke insert, update, delete on public.diagrams, public.diagram_folders, public.diagram_library_state from anon, authenticated;
grant select on public.diagrams, public.diagram_folders, public.diagram_library_state to authenticated;

create function public.get_erd_library() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision', coalesce((select revision from public.diagram_library_state where owner_id = auth.uid()), 0),
    'folders', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.diagram_folders where owner_id = auth.uid()), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'dbml',dbml,'folderId',folder_id,'positions',coalesce(layout->'positions','{}'::jsonb),
      'viewport',layout->'viewport','edgeColors',coalesce(layout->'edgeColors','{}'::jsonb),
      'tableNames',coalesce(layout->'tableNames','[]'::jsonb),'updatedAt',updated_at
    ) order by updated_at desc) from public.diagrams where owner_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- Lock + revision check keep a stale tab from overwriting a newer library.
-- Every mutation is restricted to auth.uid(); no service-role key is used by the app.
create function public.save_erd_library(p_expected_revision bigint, p_folders jsonb, p_projects jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_revision bigint;
  item jsonb;
  document_layout jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_folders) is distinct from 'array' or jsonb_typeof(p_projects) is distinct from 'array' then
    raise exception 'Invalid library';
  end if;
  insert into public.diagram_library_state(owner_id) values (actor) on conflict do nothing;
  select revision into current_revision from public.diagram_library_state where owner_id = actor for update;
  if current_revision <> p_expected_revision then
    raise exception 'LIBRARY_CONFLICT' using errcode = '40001';
  end if;

  for item in select value from jsonb_array_elements(p_folders) loop
    if exists(select 1 from public.diagram_folders where id = (item->>'id')::uuid and owner_id <> actor) then
      raise exception 'Folder ID conflict' using errcode = '42501';
    end if;
    insert into public.diagram_folders(id,owner_id,name) values ((item->>'id')::uuid,actor,item->>'name')
    on conflict (id) do update set name = excluded.name
      where public.diagram_folders.owner_id = actor and public.diagram_folders.name is distinct from excluded.name;
  end loop;

  for item in select value from jsonb_array_elements(p_projects) loop
    if exists(select 1 from public.diagrams where id = (item->>'id')::uuid and owner_id <> actor) then
      raise exception 'Project ID conflict' using errcode = '42501';
    end if;
    document_layout := jsonb_build_object('positions',coalesce(item->'positions','{}'::jsonb),
      'viewport',item->'viewport','edgeColors',coalesce(item->'edgeColors','{}'::jsonb),
      'tableNames',coalesce(item->'tableNames','[]'::jsonb));
    insert into public.diagrams(id,owner_id,title,dbml,folder_id,layout)
      values ((item->>'id')::uuid,actor,item->>'title',item->>'dbml',nullif(item->>'folderId','')::uuid,document_layout)
    on conflict (id) do update set title=excluded.title,dbml=excluded.dbml,folder_id=excluded.folder_id,layout=excluded.layout
      where public.diagrams.owner_id = actor and
      (public.diagrams.title,public.diagrams.dbml,public.diagrams.folder_id,public.diagrams.layout)
      is distinct from (excluded.title,excluded.dbml,excluded.folder_id,excluded.layout);
  end loop;

  delete from public.diagrams where owner_id=actor and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_projects));
  delete from public.diagram_folders where owner_id=actor and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_folders));
  update public.diagram_library_state set revision=revision+1 where owner_id=actor returning revision into current_revision;
  return current_revision;
end;
$$;
revoke all on function public.get_erd_library() from public, anon;
revoke all on function public.save_erd_library(bigint,jsonb,jsonb) from public, anon;
grant execute on function public.get_erd_library() to authenticated;
grant execute on function public.save_erd_library(bigint,jsonb,jsonb) to authenticated;
commit;
