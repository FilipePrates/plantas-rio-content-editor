begin;
create table public.habitat_source_notes (
  id boolean primary key default true check (id),
  content text not null check (octet_length(content) <= 200000),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);
create table public.habitat_source_notes_history (
  revision bigint primary key,
  content text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id)
);
alter table public.habitat_source_notes enable row level security;
alter table public.habitat_source_notes_history enable row level security;
revoke all on public.habitat_source_notes, public.habitat_source_notes_history from public, anon, authenticated;
grant all on public.habitat_source_notes, public.habitat_source_notes_history to service_role;

create function public.save_habitat_source_notes(p_actor uuid, p_content text, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.habitat_source_notes;
begin
  if not exists(select 1 from public.plant_editors where user_id=p_actor and active and role='admin') then
    raise exception 'admin_required';
  end if;
  if p_content is null or octet_length(p_content)>200000 or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'invalid_document';
  end if;
  perform pg_advisory_xact_lock(17487262);
  select * into result from public.habitat_source_notes where id;
  if coalesce(result.revision,0)<>p_expected_revision then
    raise exception 'revision_conflict' using errcode='40001';
  end if;
  if result.revision is null then
    insert into public.habitat_source_notes(content,updated_by) values(p_content,p_actor) returning * into result;
  else
    update public.habitat_source_notes set content=p_content,revision=revision+1,updated_at=now(),updated_by=p_actor where id returning * into result;
  end if;
  insert into public.habitat_source_notes_history(revision,content,changed_by) values(result.revision,result.content,p_actor);
  return to_jsonb(result);
end; $$;
revoke all on function public.save_habitat_source_notes(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.save_habitat_source_notes(uuid,text,bigint) to service_role;
commit;
