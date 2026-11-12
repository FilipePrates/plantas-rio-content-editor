begin;
create function public.plant_catalog_snapshot() returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'catalog',(select document from public.plant_catalog_meta where id)||jsonb_build_object('plants',(select coalesce(jsonb_agg(document order by id),'[]'::jsonb) from public.plants)),
    'records',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'editorial_state',editorial_state,'updated_at',updated_at,'updated_by',updated_by) order by id),'[]'::jsonb) from public.plants)
  );
$$;
revoke all on function public.plant_catalog_snapshot() from public,anon,authenticated;
grant execute on function public.plant_catalog_snapshot() to service_role;
commit;
