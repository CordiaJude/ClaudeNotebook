-- Draftly: target schema (Postgres 15+ on Supabase).
-- Written by /replica-architect from replica/recon.md. Becomes the baseline migration in /replica-backend.
--
-- Access rule: row level security on EVERY table. A person reaches a doc or deck only through a row in
-- `permissions` (the owner gets one by trigger). The AI never gets its own access: every AI write runs as the
-- asking user, so these same policies decide what the AI may touch.
-- Server-only writes (AI runs, mirrors, exports, billing) use the service role after the route has authenticated
-- the user and checked their role.
--
-- Conventions: uuid ids, timestamptz in UTC, every foreign key has a decided `on delete`, every foreign key and
-- every filtered/sorted column is indexed, status fields are check-constrained.

-- ------------------------------------------------------------------ types + shared trigger
create type artifact_kind as enum ('doc', 'deck');
create type access_role as enum ('owner', 'editor', 'commenter', 'viewer');

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------------ people
-- recon: User. One row per auth user, created by trigger (handle_new_user, below).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on profiles (email);
create trigger profiles_touch before update on profiles for each row execute function public.touch_updated_at();

-- recon: Workspace. Every person gets a personal workspace at sign-up; team workspaces are a "could".
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references profiles (id) on delete cascade,
  default_design_system_id uuid, -- FK added after design_systems exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_idx on workspaces (owner_id);
create index workspaces_default_ds_idx on workspaces (default_design_system_id);
create trigger workspaces_touch before update on workspaces for each row execute function public.touch_updated_at();

create table workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on workspace_members (user_id);

-- recon: DesignSystem. "is_default" is workspaces.default_design_system_id, so there can only ever be one.
create table design_systems (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null default 'Brand' check (char_length(name) between 1 and 80),
  colors jsonb not null,               -- { background, surface, text, muted, accent, palette: [...] }
  fonts jsonb not null,                -- { heading: { family, weight }, body: { family, weight } }
  components jsonb not null default '{}', -- layout + element defaults per slide layout
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index design_systems_workspace_idx on design_systems (workspace_id);
create index design_systems_created_by_idx on design_systems (created_by);
create trigger design_systems_touch before update on design_systems for each row execute function public.touch_updated_at();

alter table workspaces
  add constraint workspaces_default_ds_fk foreign key (default_design_system_id)
  references design_systems (id) on delete set null;

-- ------------------------------------------------------------------ docs and decks
-- recon: Artifact. (Internal name only; the UI says "doc", "deck" and "Library".)
-- No trash screen (recon source 8): delete is a soft delete that a daily job purges after 30 days.
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  kind artifact_kind not null,
  title text not null default 'Untitled' check (char_length(title) between 1 and 200),
  owner_id uuid not null references profiles (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  design_system_id uuid references design_systems (id) on delete set null, -- decks; null = workspace default
  room text unique,                    -- decks: the live room id. Docs keep one room per tab (doc_tabs.room).
  search tsvector generated always as (to_tsvector('simple', title)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint deck_fields_only_on_decks check (kind = 'deck' or (design_system_id is null and room is null))
);
create index artifacts_owner_recent_idx on artifacts (owner_id, updated_at desc) where deleted_at is null;
create index artifacts_workspace_idx on artifacts (workspace_id);
create index artifacts_design_system_idx on artifacts (design_system_id);
create index artifacts_search_idx on artifacts using gin (search);
create index artifacts_purge_idx on artifacts (deleted_at) where deleted_at is not null;

-- recon: Permission (user principals). Private by default: a new artifact has exactly one row, the owner's.
create table permissions (
  artifact_id uuid not null references artifacts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role access_role not null,
  invited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (artifact_id, user_id)
);
create index permissions_user_idx on permissions (user_id);
create index permissions_invited_by_idx on permissions (invited_by);
create unique index permissions_one_owner on permissions (artifact_id) where role = 'owner';
create trigger permissions_touch before update on permissions for each row execute function public.touch_updated_at();

-- Share by email with someone who has no account yet. Turned into a permissions row by claim_invites()
-- the first time that person signs in with a CONFIRMED address.
create table invites (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  email text not null check (email = lower(email)),
  role access_role not null check (role <> 'owner'),
  invited_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (artifact_id, email)
);
create index invites_pending_email_idx on invites (email) where accepted_at is null;
create index invites_invited_by_idx on invites (invited_by);

-- recon: Permission (link principal). One link per artifact; the raw token is shown once and only its hash is stored.
-- A link never grants edit, and the visitor must still sign in (recon S12).
create table share_links (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null unique references artifacts (id) on delete cascade,
  token_hash text not null unique,
  role access_role not null check (role in ('viewer', 'commenter')),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index share_links_created_by_idx on share_links (created_by);

-- recon: DocTab. The live document is a Yjs doc in `room`; `content` is a mirror written by the server
-- (search, export, backup, and so the product is never hostage to the realtime vendor).
create table doc_tabs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) between 1 and 200),
  position text not null,              -- fractional-index key
  parent_tab_id uuid references doc_tabs (id) on delete set null,
  room text not null unique,
  content jsonb,                       -- ProseMirror JSON mirror
  content_text text not null default '',
  search tsvector generated always as (to_tsvector('simple', left(content_text, 200000))) stored,
  content_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doc_tabs_artifact_idx on doc_tabs (artifact_id, position);
create index doc_tabs_parent_idx on doc_tabs (parent_tab_id);
create index doc_tabs_search_idx on doc_tabs using gin (search);
create trigger doc_tabs_touch before update on doc_tabs for each row execute function public.touch_updated_at();

-- recon: Slide. Mirror of the deck's live room, one row per slide (thumbnails, library, export, present).
create table slides (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  position text not null,
  layout text not null default 'blank',
  elements jsonb not null default '[]', -- [{ id, type: text|image|shape|chart, x, y, w, h, ...}] in a 1920x1080 space
  speaker_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index slides_artifact_idx on slides (artifact_id, position);
create trigger slides_touch before update on slides for each row execute function public.touch_updated_at();

-- Images and uploaded files. Bytes live in a private Storage bucket; rows are immutable.
create table blobs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  storage_path text not null unique,
  mime text not null,
  bytes int not null check (bytes > 0),
  sha256 text not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index blobs_artifact_idx on blobs (artifact_id);
create index blobs_created_by_idx on blobs (created_by);

-- ------------------------------------------------------------------ the AI
-- recon: Conversation. Private to one person per artifact: a viewer never reads the owner's prompts.
create table conversations (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_id, user_id)
);
create index conversations_user_idx on conversations (user_id);
create trigger conversations_touch before update on conversations for each row execute function public.touch_updated_at();

-- One row per AI request. Also the cost ledger and the one-step undo record.
create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  tab_id uuid references doc_tabs (id) on delete set null,
  conversation_id uuid references conversations (id) on delete set null,
  user_id uuid not null references profiles (id) on delete cascade,
  mode text not null check (mode in ('chat', 'selection', 'comment')),
  status text not null default 'running'
    check (status in ('running', 'awaiting_answers', 'done', 'error', 'stopped')),
  section text,                        -- "drafting section 2" progress label
  scope jsonb,                         -- selection mode: the pinned range the run may change
  undo jsonb,                          -- what to put back, per edit, newest last
  undone_at timestamptz,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_runs_artifact_idx on ai_runs (artifact_id, started_at desc);
create index ai_runs_user_idx on ai_runs (user_id, started_at desc);
create index ai_runs_tab_idx on ai_runs (tab_id);
create index ai_runs_conversation_idx on ai_runs (conversation_id);

-- recon: Message.
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  kind text not null default 'text' check (kind in ('text', 'questions', 'answers', 'error')),
  content jsonb not null,              -- {text} | {questions:[{id,prompt,options?}]} | {answers:{<id>:<value>}}
  run_id uuid references ai_runs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);
create index messages_run_idx on messages (run_id);

create table ai_usage_daily (
  user_id uuid not null references profiles (id) on delete cascade,
  day date not null,
  runs int not null default 0,
  primary key (user_id, day)
);

-- ------------------------------------------------------------------ comments, history, templates, exports
-- recon: Comment. A range anchor is the id of a comment mark inside the document, so it moves with the text.
create table comments (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  tab_id uuid references doc_tabs (id) on delete cascade,
  slide_id uuid references slides (id) on delete cascade,
  parent_id uuid references comments (id) on delete cascade, -- replies
  author_id uuid references profiles (id) on delete set null,
  author_type text not null default 'human' check (author_type in ('human', 'ai')),
  anchor jsonb,                        -- {type:'range',markId} | {type:'point',x,y} | null on replies
  body text not null check (char_length(body) between 1 and 1000),
  mentions_ai boolean not null default false,
  status text not null default 'open' check (status in ('open', 'sent', 'resolved')),
  run_id uuid references ai_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_artifact_idx on comments (artifact_id, status, created_at);
create index comments_tab_idx on comments (tab_id);
create index comments_slide_idx on comments (slide_id);
create index comments_parent_idx on comments (parent_id);
create index comments_author_idx on comments (author_id);
create index comments_run_idx on comments (run_id);
create trigger comments_touch before update on comments for each row execute function public.touch_updated_at();

-- recon: Revision. Who changed what: a person or the AI (and for the AI, on whose request).
create table revisions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  tab_id uuid references doc_tabs (id) on delete cascade,
  slide_id uuid references slides (id) on delete set null,
  author_type text not null check (author_type in ('human', 'ai')),
  author_id uuid references profiles (id) on delete set null,
  run_id uuid references ai_runs (id) on delete set null,
  summary text not null default '',
  ops jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index revisions_artifact_idx on revisions (artifact_id, created_at desc);
create index revisions_tab_idx on revisions (tab_id);
create index revisions_slide_idx on revisions (slide_id);
create index revisions_author_idx on revisions (author_id);
create index revisions_run_idx on revisions (run_id);

-- recon: Template. Global rows, shipped by migration.
create table templates (
  id uuid primary key default gen_random_uuid(),
  kind artifact_kind not null,
  title text not null,
  blurb text not null default '',
  seed_content jsonb not null,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index templates_kind_idx on templates (kind, position) where is_active;
create trigger templates_touch before update on templates for each row execute function public.touch_updated_at();

-- recon: ExportJob. Files land in a private bucket and expire.
create table export_jobs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts (id) on delete cascade,
  tab_id uuid references doc_tabs (id) on delete set null,
  user_id uuid not null references profiles (id) on delete cascade,
  format text not null check (format in ('docx', 'pdf', 'md', 'pptx', 'html', 'png', 'gdoc', 'gslides')),
  status text not null default 'queued' check (status in ('queued', 'working', 'done', 'error')),
  file_path text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz
);
create index export_jobs_artifact_idx on export_jobs (artifact_id);
create index export_jobs_tab_idx on export_jobs (tab_id);
create index export_jobs_user_idx on export_jobs (user_id, created_at desc);
create index export_jobs_expiry_idx on export_jobs (expires_at) where file_path is not null;

-- ------------------------------------------------------------------ helper functions
-- SECURITY DEFINER so policies can ask "what is my role here" without recursive RLS on permissions.
-- A soft-deleted artifact has no readers at all.
create function public.role_on(a uuid) returns access_role
language sql stable security definer set search_path = public as $$
  select p.role from permissions p join artifacts x on x.id = p.artifact_id
  where p.artifact_id = a and p.user_id = auth.uid() and x.deleted_at is null
$$;

create function public.can_read(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.role_on(a) is not null
$$;

create function public.can_comment(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_on(a) in ('owner', 'editor', 'commenter'), false)
$$;

create function public.can_edit(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_on(a) in ('owner', 'editor'), false)
$$;

create function public.is_owner(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_on(a) = 'owner', false)
$$;

create function public.in_workspace(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = w and user_id = auth.uid())
$$;

create function public.can_see_design_system(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from design_systems s where s.id = d and public.in_workspace(s.workspace_id))
      or exists (select 1 from artifacts x where x.design_system_id = d and public.can_read(x.id))
$$;

-- New artifact: the owner's permission row (this is the "private by default" state).
create function public.add_owner_permission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into permissions (artifact_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger artifacts_add_owner after insert on artifacts
  for each row execute function public.add_owner_permission();

-- Rename is the owner's alone (features.csv "Owner-only rename and delete"). Editors edit content, which
-- lives in doc_tabs / slides / the live room, never this row; so only the owner may UPDATE it, and even the
-- owner may not hand the row to someone else, move it between workspaces or change its kind.
create function public.guard_artifact_update() returns trigger
language plpgsql as $$
begin
  if new.owner_id <> old.owner_id or new.workspace_id <> old.workspace_id or new.kind <> old.kind then
    raise exception 'owner, workspace and kind cannot be changed' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger artifacts_guard before update on artifacts
  for each row execute function public.guard_artifact_update();

-- Delete = soft delete, owner only. An RPC, because once deleted_at is set the row is no longer visible to
-- its owner under the SELECT policy, and Postgres refuses an UPDATE whose result the caller cannot see.
create function public.delete_artifact(a uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(a) then
    raise exception 'only the owner can delete this' using errcode = '42501';
  end if;
  update artifacts set deleted_at = now() where id = a;
end $$;

-- Sign-up: profile + personal workspace. The display name comes from the provider or the address.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
declare nm text;
begin
  nm := left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''),
                      split_part(new.email, '@', 1), 'Someone'), 80);
  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, lower(new.email), nm, new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  insert into public.workspaces (name, owner_id) values (left(nm || '''s workspace', 80), new.id) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called by the server right after sign-in. Turns pending invites for MY confirmed address into permissions.
-- Never downgrades or replaces a role the person already has.
create function public.claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
declare addr text;
declare n int;
begin
  select lower(u.email) into addr from auth.users u where u.id = me and u.email_confirmed_at is not null;
  if addr is null then return 0; end if;
  with claimed as (
    update invites i set accepted_at = now()
    where i.email = addr and i.accepted_at is null
    returning i.artifact_id, i.role, i.invited_by
  ), added as (
    insert into permissions (artifact_id, user_id, role, invited_by)
    select c.artifact_id, me, c.role, c.invited_by from claimed c
    on conflict (artifact_id, user_id) do nothing
    returning 1
  )
  select count(*) into n from added;
  return n;
end $$;

-- Share by email (owner only). The lookup happens here so signed-in people cannot probe which addresses
-- have accounts: the caller only learns "shared" or "invited".
create function public.share_by_email(a uuid, addr text, r access_role) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not public.is_owner(a) then
    raise exception 'only the owner can share this' using errcode = '42501';
  end if;
  if r = 'owner' then
    raise exception 'there is one owner' using errcode = '22023';
  end if;
  addr := lower(trim(addr));
  select id into target from profiles where email = addr;
  if target = auth.uid() then
    raise exception 'you already own this' using errcode = '22023';
  end if;
  if target is not null then
    insert into permissions (artifact_id, user_id, role, invited_by) values (a, target, r, auth.uid())
    on conflict (artifact_id, user_id) do update set role = excluded.role where permissions.role <> 'owner';
    return 'shared';
  end if;
  insert into invites (artifact_id, email, role, invited_by) values (a, addr, r, auth.uid())
  on conflict (artifact_id, email) do update set role = excluded.role, accepted_at = null;
  return 'invited';
end $$;

-- Opening a share link while signed in. The server passes the SHA-256 of the token from the URL.
-- Gives the link's role only to someone with no access yet; never changes an existing role.
create function public.redeem_share_link(hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare l share_links%rowtype;
begin
  if auth.uid() is null then return null; end if;
  select s.* into l from share_links s join artifacts x on x.id = s.artifact_id
  where s.token_hash = hash and s.revoked_at is null and x.deleted_at is null;
  if l.id is null then return null; end if;
  insert into permissions (artifact_id, user_id, role, invited_by) values (l.artifact_id, auth.uid(), l.role, l.created_by)
  on conflict (artifact_id, user_id) do nothing;
  return l.artifact_id;
end $$;

-- Atomic daily cap on AI runs per person. Service role only.
create function public.ai_try_start_run(p_user uuid, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare started boolean;
begin
  insert into ai_usage_daily (user_id, day, runs)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set runs = ai_usage_daily.runs + 1
    where ai_usage_daily.runs < p_max
  returning true into started;
  return coalesce(started, false);
end $$;

revoke all on function public.ai_try_start_run(uuid, int) from public;
revoke all on function public.ai_try_start_run(uuid, int) from anon, authenticated;
grant execute on function public.ai_try_start_run(uuid, int) to service_role;
-- The remaining RPCs are for signed-in people only (each one also checks auth.uid() itself).
revoke all on function public.claim_invites() from public;
revoke all on function public.share_by_email(uuid, text, access_role) from public;
revoke all on function public.redeem_share_link(text) from public;
revoke all on function public.delete_artifact(uuid) from public;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.share_by_email(uuid, text, access_role) to authenticated;
grant execute on function public.redeem_share_link(text) to authenticated;
grant execute on function public.delete_artifact(uuid) to authenticated;

-- ------------------------------------------------------------------ row level security
alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table design_systems enable row level security;
alter table artifacts enable row level security;
alter table permissions enable row level security;
alter table invites enable row level security;
alter table share_links enable row level security;
alter table doc_tabs enable row level security;
alter table slides enable row level security;
alter table blobs enable row level security;
alter table conversations enable row level security;
alter table ai_runs enable row level security;
alter table messages enable row level security;
alter table ai_usage_daily enable row level security;
alter table comments enable row level security;
alter table revisions enable row level security;
alter table templates enable row level security;
alter table export_jobs enable row level security;

-- profiles: my own row, plus the people I share something with. plan and billing columns are server-written.
create policy profiles_select on profiles for select using (
  id = auth.uid() or exists (
    select 1 from permissions a join permissions b on a.artifact_id = b.artifact_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (display_name, avatar_url) on profiles to authenticated;

-- workspaces: members read, owner edits. Rows are created by the sign-up trigger.
create policy workspaces_select on workspaces for select using (public.in_workspace(id));
create policy workspaces_update on workspaces for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy workspace_members_select on workspace_members for select using (public.in_workspace(workspace_id));

-- design systems: workspace members manage them; anyone who can read a deck that uses one can read it.
create policy design_systems_select on design_systems for select using (public.can_see_design_system(id));
create policy design_systems_insert on design_systems for insert with check (public.in_workspace(workspace_id) and created_by = auth.uid());
create policy design_systems_update on design_systems for update using (public.in_workspace(workspace_id)) with check (public.in_workspace(workspace_id));
create policy design_systems_delete on design_systems for delete using (public.in_workspace(workspace_id));

-- artifacts. The owner_id test lets INSERT ... RETURNING work before the trigger's permission row is visible.
create policy artifacts_select on artifacts for select using (
  deleted_at is null and (owner_id = auth.uid() or public.can_read(id))
);
create policy artifacts_insert on artifacts for insert with check (owner_id = auth.uid() and public.in_workspace(workspace_id));
create policy artifacts_update on artifacts for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- no DELETE policy: people soft-delete through delete_artifact(); the purge job uses the service role.

-- permissions: everyone with access sees who else has it; only the owner changes it, and never the owner row.
create policy permissions_select on permissions for select using (public.can_read(artifact_id));
create policy permissions_insert on permissions for insert with check (public.is_owner(artifact_id) and role <> 'owner');
create policy permissions_update on permissions for update using (public.is_owner(artifact_id) and role <> 'owner')
  with check (public.is_owner(artifact_id) and role <> 'owner');
create policy permissions_delete on permissions for delete using (
  role <> 'owner' and (public.is_owner(artifact_id) or user_id = auth.uid()) -- the owner removes people; anyone can leave
);

-- invites and share links: owner only.
create policy invites_all on invites for all using (public.is_owner(artifact_id))
  with check (public.is_owner(artifact_id) and invited_by = auth.uid());
create policy share_links_all on share_links for all using (public.is_owner(artifact_id)) with check (public.is_owner(artifact_id));

-- content: read with any role, write with owner or editor.
create policy doc_tabs_select on doc_tabs for select using (public.can_read(artifact_id));
create policy doc_tabs_insert on doc_tabs for insert with check (public.can_edit(artifact_id));
create policy doc_tabs_update on doc_tabs for update using (public.can_edit(artifact_id)) with check (public.can_edit(artifact_id));
create policy doc_tabs_delete on doc_tabs for delete using (public.can_edit(artifact_id));
create policy slides_select on slides for select using (public.can_read(artifact_id));
create policy slides_insert on slides for insert with check (public.can_edit(artifact_id));
create policy slides_update on slides for update using (public.can_edit(artifact_id)) with check (public.can_edit(artifact_id));
create policy slides_delete on slides for delete using (public.can_edit(artifact_id));

-- blobs: immutable. Read with any role, add as yourself with edit rights, remove as owner.
create policy blobs_select on blobs for select using (public.can_read(artifact_id));
create policy blobs_insert on blobs for insert with check (public.can_edit(artifact_id) and created_by = auth.uid());
create policy blobs_delete on blobs for delete using (public.is_owner(artifact_id));

-- conversations and messages: mine only, and only while I can still read the artifact.
create policy conversations_select on conversations for select using (user_id = auth.uid() and public.can_read(artifact_id));
create policy conversations_insert on conversations for insert with check (user_id = auth.uid() and public.can_read(artifact_id));
create policy messages_select on messages for select using (
  exists (select 1 from conversations c where c.id = messages.conversation_id and c.user_id = auth.uid() and public.can_read(c.artifact_id))
);
-- messages, ai_runs, ai_usage_daily and revisions are written by the server only.
create policy ai_runs_select on ai_runs for select using (user_id = auth.uid() and public.can_read(artifact_id));
create policy ai_usage_select on ai_usage_daily for select using (user_id = auth.uid());
create policy revisions_select on revisions for select using (public.can_read(artifact_id));

-- comments: read with any role; write as yourself with commenter or better. Asking the AI in a comment
-- needs edit rights (recon F03 edge: a commenter cannot ask the AI). AI replies are server-written.
create policy comments_select on comments for select using (public.can_read(artifact_id));
create policy comments_insert on comments for insert with check (
  public.can_comment(artifact_id) and author_id = auth.uid() and author_type = 'human'
  and (not mentions_ai or public.can_edit(artifact_id))
);
create policy comments_update on comments for update
  using (public.can_comment(artifact_id) and (author_id = auth.uid() or public.can_edit(artifact_id)))
  with check (public.can_comment(artifact_id) and (not mentions_ai or public.can_edit(artifact_id)));
create policy comments_delete on comments for delete using (author_id = auth.uid() or public.is_owner(artifact_id));
revoke update on comments from authenticated;
grant update (body, status, mentions_ai) on comments to authenticated;

-- templates: any signed-in person reads the active ones.
create policy templates_select on templates for select to authenticated using (is_active);

-- exports: anyone who can read can export; you only see your own jobs. Status is server-written.
create policy export_jobs_select on export_jobs for select using (user_id = auth.uid());
create policy export_jobs_insert on export_jobs for insert with check (
  user_id = auth.uid() and public.can_read(artifact_id) and status = 'queued' and file_path is null
);

-- ------------------------------------------------------------------ storage
-- Private buckets. Objects are only ever served through short signed URLs after a server-side role check.
insert into storage.buckets (id, name, public) values ('blobs', 'blobs', false), ('exports', 'exports', false)
on conflict do nothing;
