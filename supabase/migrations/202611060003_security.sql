-- 로그인 변경 중 잘못된 계정으로 저장되는 것을 차단하고 입력·권한을 강화합니다.
begin;
create or replace function public.get_erd_library() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'ownerId', auth.uid(),
    'revision', coalesce((select revision from public.diagram_library_state where owner_id = auth.uid()), 0),
    'folders', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.diagram_folders where owner_id = auth.uid()), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'dbml',dbml,'folderId',folder_id,'positions',coalesce(layout->'positions','{}'::jsonb),
      'viewport',layout->'viewport','edgeColors',coalesce(layout->'edgeColors','{}'::jsonb),
      'tableNames',coalesce(layout->'tableNames','[]'::jsonb),'updatedAt',updated_at
    ) order by updated_at desc) from public.diagrams where owner_id = auth.uid()), '[]'::jsonb)
  );
$$;
drop function public.save_erd_library(bigint,jsonb,jsonb);
create function public.save_erd_library(p_expected_revision bigint, p_folders jsonb, p_projects jsonb, p_owner_id uuid) returns bigint
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
  if actor is distinct from p_owner_id then raise exception 'Account changed' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if jsonb_typeof(p_folders) is distinct from 'array' or jsonb_typeof(p_projects) is distinct from 'array' then raise exception 'Invalid library'; end if;
  if jsonb_array_length(p_folders)>500 or jsonb_array_length(p_projects)>500 or octet_length(p_projects::text)>20000000 then raise exception 'Library size limit exceeded'; end if;
  if exists(select 1 from jsonb_array_elements(p_projects) p where jsonb_typeof(p->'dbml') is distinct from 'string' or char_length(p->>'dbml')>1000000 or jsonb_typeof(p->'title') is distinct from 'string' or char_length(p->>'title') not between 1 and 200 or jsonb_typeof(p->'positions') is distinct from 'object') then raise exception 'Invalid project payload'; end if;
  if exists(select 1 from jsonb_array_elements(p_folders) f where jsonb_typeof(f->'name') is distinct from 'string' or char_length(f->>'name') not between 1 and 200) then raise exception 'Invalid folder payload'; end if;
  if (select count(*) from jsonb_array_elements(p_projects))<>(select count(distinct value->>'id') from jsonb_array_elements(p_projects)) or (select count(*) from jsonb_array_elements(p_folders))<>(select count(distinct value->>'id') from jsonb_array_elements(p_folders)) then raise exception 'Duplicate or missing IDs'; end if;
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
revoke all on public.diagrams,public.diagram_folders,public.diagram_library_state from public,anon,authenticated;
grant select on public.diagrams,public.diagram_folders,public.diagram_library_state to authenticated;
revoke all on function public.save_erd_library(bigint,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_erd_library(bigint,jsonb,jsonb,uuid) to authenticated;
commit;

