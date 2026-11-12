begin;
-- Use the same lock as editorial saves so a cleanup cannot race a writer.
select pg_advisory_xact_lock(17487261);
with corrected as (
  update public.plants
  set document=jsonb_set(document,'{commonName}','""'::jsonb),
      revision=revision+1, updated_at=now(), updated_by=null
  where jsonb_typeof(document->'commonName')='string'
    and btrim(document->>'commonName')<>''
    and lower(btrim(document->>'commonName'))=lower(btrim(document->>'scientificName'))
  returning *
), audited as (
  insert into public.plant_history(plant_id,revision,document,editorial_state,changed_at,changed_by)
  select id,revision,document,editorial_state,updated_at,null from corrected
  returning plant_id
)
update public.plant_catalog_meta
set revision=revision+1, document=jsonb_set(document,'{updatedAt}',to_jsonb(now()))
where id and exists(select 1 from audited);
commit;
