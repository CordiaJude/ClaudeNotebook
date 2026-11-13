-- Atomic per-user daily cap for agent runs (spec §14). Called by the server with the service role only.
create or replace function public.agent_try_start_run(p_user uuid, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare started boolean;
begin
  insert into agent_usage_daily (user_id, day, runs)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set runs = agent_usage_daily.runs + 1
    where agent_usage_daily.runs < p_max
  returning true into started;
  return coalesce(started, false);
end $$;

revoke all on function public.agent_try_start_run(uuid, int) from public;
revoke all on function public.agent_try_start_run(uuid, int) from anon, authenticated;
grant execute on function public.agent_try_start_run(uuid, int) to service_role;
