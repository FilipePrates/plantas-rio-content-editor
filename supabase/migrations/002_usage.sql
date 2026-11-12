begin;
create function public.plant_editor_usage() returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('database_bytes',pg_database_size(current_database()),'records',(select count(*) from public.plants),'revisions',(select count(*) from public.plant_history),'active_editors',(select count(*) from public.plant_editors where active));
$$;
revoke all on function public.plant_editor_usage() from public,anon,authenticated;
grant execute on function public.plant_editor_usage() to service_role;
commit;
