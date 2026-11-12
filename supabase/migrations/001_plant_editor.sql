begin;
create table public.plant_editors (
  user_id uuid primary key references auth.users(id),
  display_name text not null check(length(display_name) between 1 and 120),
  role text not null check(role in ('admin','reviewer','contributor')),
  active boolean not null default true
);
create table public.plant_catalog_meta (
  id boolean primary key default true check(id),
  document jsonb not null,
  revision bigint not null default 1
);
create table public.plants (
  id text primary key,
  document jsonb not null check(document->>'id'=id),
  revision bigint not null default 1,
  editorial_state text not null default 'draft' check(editorial_state in ('draft','submitted','approved')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table public.plant_history (
  plant_id text not null references public.plants(id),
  revision bigint not null,
  document jsonb not null,
  editorial_state text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  primary key(plant_id,revision)
);
create table public.plant_comments (
  id bigint generated always as identity primary key,
  plant_id text not null references public.plants(id),
  author_id uuid not null references auth.users(id),
  body text not null check(length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.plant_editors enable row level security;
alter table public.plant_catalog_meta enable row level security;
alter table public.plants enable row level security;
alter table public.plant_history enable row level security;
alter table public.plant_comments enable row level security;
-- Browser clients cannot bypass the server's complete botanical/schema validation.
revoke all on public.plant_editors, public.plant_catalog_meta, public.plants, public.plant_history, public.plant_comments from anon, authenticated;
grant all on public.plant_editors, public.plant_catalog_meta, public.plants, public.plant_history, public.plant_comments to service_role;
grant usage, select on sequence public.plant_comments_id_seq to service_role;

create function public.seed_plant_catalog(p_catalog jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(17487261);
  if exists(select 1 from public.plant_catalog_meta) then raise exception 'already_seeded'; end if;
  if jsonb_typeof(p_catalog->'plants') is distinct from 'array' or jsonb_array_length(p_catalog->'plants')=0 then raise exception 'invalid_catalog'; end if;
  insert into public.plant_catalog_meta(document) values(p_catalog-'plants');
  insert into public.plants(id,document)
    select item->>'id',item from jsonb_array_elements(p_catalog->'plants') item;
  insert into public.plant_history(plant_id,revision,document,editorial_state)
    select id,revision,document,editorial_state from public.plants;
end; $$;
revoke all on function public.seed_plant_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.seed_plant_catalog(jsonb) to service_role;

create function public.save_plant(p_actor uuid,p_document jsonb,p_expected_revision bigint,p_catalog_revision bigint,p_state text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member_role text; existing public.plants; result public.plants; catalog_revision bigint; species_total integer; unique_total integer;
begin
  perform pg_advisory_xact_lock(17487261);
  select role into member_role from public.plant_editors where user_id=p_actor and active;
  if member_role is null then raise exception 'editor_required'; end if;
  if p_state not in ('draft','submitted','approved') or p_state is null then raise exception 'invalid_state'; end if;
  if p_state='approved' and member_role='contributor' then raise exception 'reviewer_required'; end if;
  select revision into catalog_revision from public.plant_catalog_meta where id;
  if catalog_revision is distinct from p_catalog_revision then raise exception 'catalog_conflict' using errcode='40001'; end if;
  if p_document->>'id' is null or octet_length(p_document::text)>2000000 then raise exception 'invalid_document'; end if;
  select * into existing from public.plants where id=p_document->>'id';
  if (existing.id is null and p_expected_revision<>0) or (existing.id is not null and existing.revision<>p_expected_revision) then
    raise exception 'revision_conflict' using errcode='40001';
  end if;
  if existing.id is null then
    insert into public.plants(id,document,updated_by,editorial_state) values(p_document->>'id',p_document,p_actor,p_state) returning * into result;
  else
    update public.plants set document=p_document,revision=revision+1,updated_at=now(),updated_by=p_actor,editorial_state=p_state
      where id=existing.id returning * into result;
  end if;
  with represented as (
    select document->>'scientificName' name from public.plants where document->>'rank'='species'
    union all
    select member->>'scientificName' from public.plants p cross join lateral jsonb_array_elements(p.document->'regionalSpecies') member where p.document->>'rank'='genus'
  ) select count(*),count(distinct name) into species_total,unique_total from represented;
  if species_total>1500 or species_total<>unique_total then raise exception 'duplicate_or_excess_species'; end if;
  if exists(
    select alias from public.plants p cross join lateral jsonb_array_elements_text(coalesce(p.document->'previousIds','[]')) alias
    group by alias having count(*)>1 or exists(select 1 from public.plants where id=alias)
  ) then raise exception 'duplicate_previous_id'; end if;
  insert into public.plant_history(plant_id,revision,document,editorial_state,changed_by)
    values(result.id,result.revision,result.document,result.editorial_state,p_actor);
  update public.plant_catalog_meta set revision=revision+1,document=jsonb_set(document,'{updatedAt}',to_jsonb(now())) where id;
  return to_jsonb(result);
end; $$;
revoke all on function public.save_plant(uuid,jsonb,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.save_plant(uuid,jsonb,bigint,bigint,text) to service_role;
commit;
