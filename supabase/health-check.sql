-- Independent, read-only health RPC. Does not access classroom tables.
begin;
set local lock_timeout = '5s';
create function public.pi_helper_health_check()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$ select true; $$;
revoke all on function public.pi_helper_health_check() from public, anon, authenticated, service_role;
grant execute on function public.pi_helper_health_check() to anon;
comment on function public.pi_helper_health_check() is 'Returns true only; no classroom data access. Best-effort activity, not a no-pause guarantee.';
notify pgrst, 'reload schema';
commit;
