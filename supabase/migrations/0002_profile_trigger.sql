-- Create a profile row automatically for each new auth user (notebooks.owner_id references profiles).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'Someone'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users that signed up before this trigger existed.
insert into public.profiles (id, display_name)
select id, coalesce(nullif(raw_user_meta_data->>'name', ''), split_part(email, '@', 1), 'Someone')
from auth.users on conflict (id) do nothing;
