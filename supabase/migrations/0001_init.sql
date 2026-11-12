-- Claude Notebook: initial schema + RLS (spec §6)
-- Access model: everything goes through notebook_members (owner is also inserted as a member).

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  title text not null default 'Untitled',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create type member_role as enum ('owner', 'editor', 'commenter', 'viewer');

create table notebook_members (
  notebook_id uuid references notebooks on delete cascade,
  user_id uuid references profiles on delete cascade,
  role member_role not null,
  is_guest boolean default false,
  primary key (notebook_id, user_id)
);

create table share_links (
  token text primary key,
  notebook_id uuid references notebooks on delete cascade,
  role member_role not null check (role in ('viewer', 'commenter')),
  requires_login boolean default true,
  expires_at timestamptz
);

create table tabs (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid references notebooks on delete cascade,
  name text not null,
  order_key text not null,
  parent_tab_id uuid references tabs on delete set null,
  liveblocks_room text not null unique
);

create table enums (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid references notebooks on delete cascade,
  name text not null,
  options jsonb not null
);

create table widgets (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid references notebooks on delete cascade,
  tab_id uuid references tabs on delete cascade,
  kind text check (kind in ('chart', 'diagram')),
  spec jsonb not null,
  published_rev int default 1,
  draft jsonb
);

create table blobs (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid references notebooks on delete cascade,
  storage_path text not null,
  mime text not null,
  bytes int not null,
  sha256 text not null,
  origin jsonb,
  created_by uuid references profiles,
  created_at timestamptz default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid references notebooks on delete cascade,
  tab_id uuid,
  user_id uuid references profiles,
  trigger text check (trigger in ('panel', 'comment', 'selection')),
  thread_id text,
  status text check (status in ('running', 'done', 'error', 'stopped')),
  section text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  input_tokens int default 0,
  output_tokens int default 0
);

create table agent_usage_daily (
  user_id uuid,
  day date,
  runs int default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER avoids recursive RLS evaluation on notebook_members.
create function public.nb_role(nb uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from notebook_members where notebook_id = nb and user_id = auth.uid()
$$;

create function public.nb_can_read(nb uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebook_members where notebook_id = nb and user_id = auth.uid())
$$;

create function public.nb_can_write(nb uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebook_members
                 where notebook_id = nb and user_id = auth.uid() and role in ('owner', 'editor'))
$$;

create function public.nb_is_owner(nb uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebook_members
                 where notebook_id = nb and user_id = auth.uid() and role = 'owner')
$$;

-- Creating a notebook auto-adds the owner as a member.
create function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notebook_members (notebook_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger notebooks_add_owner after insert on notebooks
  for each row execute function public.add_owner_member();

-- ---------------------------------------------------------------- RLS
alter table profiles enable row level security;
alter table notebooks enable row level security;
alter table notebook_members enable row level security;
alter table share_links enable row level security;
alter table tabs enable row level security;
alter table enums enable row level security;
alter table widgets enable row level security;
alter table blobs enable row level security;
alter table agent_runs enable row level security;
alter table agent_usage_daily enable row level security;

-- profiles: own row + people who share a notebook with you
create policy profiles_select on profiles for select using (
  id = auth.uid() or exists (
    select 1 from notebook_members a join notebook_members b on a.notebook_id = b.notebook_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_insert on profiles for insert with check (id = auth.uid());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- notebooks
-- owner_id check: INSERT ... RETURNING evaluates this before the AFTER trigger adds the member row.
create policy notebooks_select on notebooks for select using (owner_id = auth.uid() or public.nb_can_read(id));
create policy notebooks_insert on notebooks for insert with check (owner_id = auth.uid());
create policy notebooks_update on notebooks for update using (public.nb_can_write(id)) with check (public.nb_can_write(id));
create policy notebooks_delete on notebooks for delete using (public.nb_is_owner(id));

-- notebook_members: members see the roster; only owner manages it
create policy members_select on notebook_members for select using (public.nb_can_read(notebook_id));
create policy members_insert on notebook_members for insert with check (public.nb_is_owner(notebook_id));
create policy members_update on notebook_members for update using (public.nb_is_owner(notebook_id)) with check (public.nb_is_owner(notebook_id));
create policy members_delete on notebook_members for delete using (public.nb_is_owner(notebook_id));

-- share_links: owner only
create policy share_links_all on share_links for all using (public.nb_is_owner(notebook_id)) with check (public.nb_is_owner(notebook_id));

-- tabs, enums, widgets: read = member, write = owner/editor
create policy tabs_select on tabs for select using (public.nb_can_read(notebook_id));
create policy tabs_write on tabs for all using (public.nb_can_write(notebook_id)) with check (public.nb_can_write(notebook_id));
create policy enums_select on enums for select using (public.nb_can_read(notebook_id));
create policy enums_write on enums for all using (public.nb_can_write(notebook_id)) with check (public.nb_can_write(notebook_id));
create policy widgets_select on widgets for select using (public.nb_can_read(notebook_id));
create policy widgets_write on widgets for all using (public.nb_can_write(notebook_id)) with check (public.nb_can_write(notebook_id));

-- blobs: read = member, insert = owner/editor (as self), no update (immutable), delete = owner
create policy blobs_select on blobs for select using (public.nb_can_read(notebook_id));
create policy blobs_insert on blobs for insert with check (public.nb_can_write(notebook_id) and created_by = auth.uid());
create policy blobs_delete on blobs for delete using (public.nb_is_owner(notebook_id));

-- agent_runs: members read; rows are written by the server (service role bypasses RLS)
create policy agent_runs_select on agent_runs for select using (public.nb_can_read(notebook_id));

-- agent_usage_daily: user reads own; writes server-side only
create policy usage_select on agent_usage_daily for select using (user_id = auth.uid());

-- Storage: private bucket; objects served via signed URLs after membership check (server side).
insert into storage.buckets (id, name, public) values ('blobs', 'blobs', false) on conflict do nothing;
