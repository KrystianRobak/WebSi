-- ============================================================================
-- Aethelgard Vault — Web-Only Multi-Campaign, West Marches, Sheets & VTT Schema
-- Idempotent for both fresh databases and migrations from legacy schema.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. Legacy Token / Probe Cleanup
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.worlds') is not null then
    drop policy if exists "worlds_token_all" on public.worlds;
  end if;
  if to_regclass('public.entities') is not null then
    drop policy if exists "entities_token_all" on public.entities;
  end if;
  if to_regclass('public.entity_links') is not null then
    drop policy if exists "entity_links_token_all" on public.entity_links;
  end if;
  if to_regclass('public.maps') is not null then
    drop policy if exists "maps_token_all" on public.maps;
  end if;
  if to_regclass('public.map_pins') is not null then
    drop policy if exists "map_pins_token_all" on public.map_pins;
  end if;
  if to_regclass('public.map_paths') is not null then
    drop policy if exists "map_paths_token_all" on public.map_paths;
  end if;
  if to_regclass('public.vault_assets') is not null then
    drop policy if exists "vault_assets_token_all" on public.vault_assets;
  end if;
  if to_regclass('public.entity_templates') is not null then
    drop policy if exists "entity_templates_token_all" on public.entity_templates;
  end if;
  if to_regclass('public.vault_probe') is not null then
    drop policy if exists "vault_probe_token_select" on public.vault_probe;
  end if;
end $$;

drop policy if exists "vault_assets_public_read" on storage.objects;
drop policy if exists "vault_assets_token_insert" on storage.objects;
drop policy if exists "vault_assets_token_update" on storage.objects;
drop policy if exists "vault_assets_token_delete" on storage.objects;
drop policy if exists "vault_assets_auth_insert" on storage.objects;
drop policy if exists "vault_assets_auth_update" on storage.objects;
drop policy if exists "vault_assets_auth_delete" on storage.objects;

drop table if exists public.vault_probe cascade;
drop table if exists private.vault_credentials cascade;
drop function if exists private.has_valid_vault_token() cascade;
drop schema if exists private cascade;

-- ----------------------------------------------------------------------------
-- 1. Player Profiles (backed by auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Adventurer'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Adventurer'
  ),
  nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), '')
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Worlds (Campaigns) & Campaign Members
-- ----------------------------------------------------------------------------
create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null default auth.uid(),
  name text not null,
  description text default '',
  mode text not null default 'normal' constraint worlds_mode_check check (mode in ('normal', 'west_marches')),
  invite_code text unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  max_players_per_party integer not null default 5 constraint worlds_max_players_per_party_check check (max_players_per_party >= 1),
  calendar_config jsonb,
  active_sheet_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worlds
  alter column owner_id set default auth.uid();

alter table public.worlds
  add column if not exists mode text not null default 'normal',
  add column if not exists invite_code text default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  add column if not exists max_players_per_party integer not null default 5,
  add column if not exists calendar_config jsonb,
  add column if not exists active_sheet_template_id uuid;

alter table public.worlds
  alter column invite_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

update public.worlds
set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where invite_code is null or trim(invite_code) = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.worlds'::regclass
      and conname = 'worlds_mode_check'
  ) then
    alter table public.worlds
      add constraint worlds_mode_check check (mode in ('normal', 'west_marches'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.worlds'::regclass
      and conname = 'worlds_max_players_per_party_check'
  ) then
    alter table public.worlds
      add constraint worlds_max_players_per_party_check check (max_players_per_party >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.worlds'::regclass
      and conname = 'worlds_invite_code_key'
  ) and not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'worlds'
      and indexdef ilike '%unique%'
      and indexdef ilike '%(invite_code)%'
  ) then
    alter table public.worlds
      add constraint worlds_invite_code_key unique (invite_code);
  end if;
end $$;

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('gm', 'co_gm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

insert into public.campaign_members (campaign_id, user_id, role)
select id, owner_id, 'gm'
from public.worlds
where owner_id is not null
on conflict (campaign_id, user_id) do update set role = 'gm';

create or replace function public.handle_world_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := coalesce(new.owner_id, auth.uid());
  if v_owner is not null then
    insert into public.campaign_members (campaign_id, user_id, role)
    values (new.id, v_owner, 'gm')
    on conflict (campaign_id, user_id) do update set role = 'gm';
  end if;
  return new;
end;
$$;

drop trigger if exists on_world_created on public.worlds;
create trigger on_world_created
  after insert on public.worlds
  for each row execute function public.handle_world_created();

create or replace function public.guard_world_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.owner_id is distinct from old.owner_id
     and old.owner_id is distinct from auth.uid() then
    raise exception 'Only the campaign owner can transfer ownership.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_world_owner_change on public.worlds;
create trigger guard_world_owner_change
  before update on public.worlds
  for each row execute function public.guard_world_owner_change();

create or replace function public.guard_world_west_marches_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'west_marches' and old.mode is distinct from 'west_marches' then
    perform pg_advisory_xact_lock(hashtext('world_mode:' || new.id::text));

    if exists (
      select 1
      from public.characters
      where campaign_id = new.id
        and is_active = true
      group by user_id
      having count(*) > 1
    ) then
      raise exception 'Cannot switch to West Marches while a player has more than one active character.'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_world_west_marches_transition on public.worlds;
create trigger guard_world_west_marches_transition
  before update of mode on public.worlds
  for each row execute function public.guard_world_west_marches_transition();

create or replace function public.is_campaign_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = cid
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_gm(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = cid
      and cm.user_id = auth.uid()
      and cm.role in ('gm', 'co_gm')
  );
$$;

create or replace function public.is_campaign_primary_gm(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.worlds w
    where w.id = cid
      and w.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = cid
      and cm.user_id = auth.uid()
      and cm.role = 'gm'
  );
$$;

create or replace function public.join_campaign_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_code text;
  v_campaign_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required to join a campaign';
  end if;

  v_code := lower(trim(coalesce(p_invite_code, '')));
  if v_code = '' then
    raise exception 'Invite code cannot be empty';
  end if;

  select w.id
  into v_campaign_id
  from public.worlds w
  where lower(w.invite_code) = v_code
  limit 1;

  if v_campaign_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign_id, v_uid, 'player')
  on conflict (campaign_id, user_id) do nothing;

  return v_campaign_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Entities, Links, Maps, Pins, Paths, Vault Assets, Entity Templates
-- ----------------------------------------------------------------------------
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  slug text not null,
  title text not null,
  type text not null default 'Location',
  category text not null default 'encyclopedia',
  tags text[] not null default '{}',
  summary text not null default '',
  content text not null default '',
  gm_secrets text not null default '',
  cover_image_url text,
  metadata jsonb not null default '{}'::jsonb,
  is_favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(world_id, slug)
);

create table if not exists public.entity_links (
  source_id uuid not null references public.entities(id) on delete cascade,
  target_id uuid not null references public.entities(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  primary key (source_id, target_id)
);

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  name text not null,
  kind text not null default '3d',
  albedo_url text,
  heightmap_url text,
  paint_url text,
  width integer not null default 8192,
  height integer not null default 8192,
  world_size numeric default 100,
  sea_level numeric default 0.23,
  displacement_scale numeric not null default 12.5,
  scale_config jsonb not null default '{"ratio":"1 : 250 000","elevationSource":"Heightmap (32-bit)","kmPerUnit":1.8}'::jsonb,
  generation_config jsonb,
  atmosphere text,
  water jsonb,
  terrain_shading jsonb,
  fog_volumes jsonb not null default '[]'::jsonb,
  fog_of_war_2d text,
  combat_state jsonb,
  rivers jsonb not null default '[]'::jsonb,
  props jsonb not null default '[]'::jsonb,
  layers jsonb not null default '[]'::jsonb,
  zones jsonb not null default '[]'::jsonb,
  labels jsonb not null default '[]'::jsonb,
  battlemap jsonb,
  created_at timestamptz not null default now()
);

alter table public.maps
  add column if not exists world_size numeric default 100,
  add column if not exists sea_level numeric default 0.23,
  add column if not exists paint_url text,
  add column if not exists water jsonb,
  add column if not exists terrain_shading jsonb,
  add column if not exists fog_volumes jsonb not null default '[]'::jsonb,
  add column if not exists fog_of_war_2d text,
  add column if not exists combat_state jsonb,
  add column if not exists layers jsonb not null default '[]'::jsonb,
  add column if not exists zones jsonb not null default '[]'::jsonb,
  add column if not exists labels jsonb not null default '[]'::jsonb;

create table if not exists public.map_pins (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  label text not null,
  x numeric not null,
  y numeric not null,
  z numeric not null,
  icon_type text not null default 'settlement',
  is_gm_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.map_paths (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  name text not null,
  points jsonb not null default '[]'::jsonb,
  style text not null default 'dashed-gold',
  is_gm_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_assets (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  slug text not null,
  name text not null,
  url text not null,
  kind text not null default 'portrait',
  created_at timestamptz not null default now(),
  unique(world_id, slug)
);

create table if not exists public.entity_templates (
  world_id uuid not null references public.worlds(id) on delete cascade,
  type text not null,
  label text not null,
  summary_placeholder text not null default '',
  default_tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  content text not null default '',
  custom_css text not null default '',
  updated_at timestamptz not null default now(),
  primary key (world_id, type)
);

-- ----------------------------------------------------------------------------
-- 4. Characters & Roll20-Style Sheet Templates
-- ----------------------------------------------------------------------------
create table if not exists public.character_sheet_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  name text not null,
  system_label text not null default 'Custom',
  html_template text not null default '',
  css_template text not null default '',
  schema_json jsonb not null default '{"defaults":{},"computed":{}}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.worlds'::regclass
      and conname = 'worlds_active_sheet_template_id_fkey'
  ) then
    alter table public.worlds
      add constraint worlds_active_sheet_template_id_fkey
      foreign key (active_sheet_template_id)
      references public.character_sheet_templates(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  portrait_url text,
  entity_id uuid references public.entities(id) on delete set null,
  sheet_template_id uuid references public.character_sheet_templates(id) on delete set null,
  attributes jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

drop index if exists public.uniq_west_marches_one_active_char;
create index if not exists idx_characters_campaign_user_active
  on public.characters (campaign_id, user_id)
  where is_active = true;

create or replace function public.enforce_west_marches_single_active_char()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  perform pg_advisory_xact_lock(hashtext(new.campaign_id::text || ':' || new.user_id::text));

  select mode
  into v_mode
  from public.worlds
  where id = new.campaign_id
  for share;

  perform pg_advisory_xact_lock_shared(hashtext('world_mode:' || new.campaign_id::text));

  if new.is_active is true
     and v_mode = 'west_marches'
     and exists (
       select 1
       from public.characters c
       where c.campaign_id = new.campaign_id
         and c.user_id = new.user_id
         and c.is_active = true
         and c.id is distinct from new.id
     ) then
    raise exception 'West Marches campaigns allow at most 1 active character per player.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_west_marches_single_active_char on public.characters;
create trigger trg_enforce_west_marches_single_active_char
  before insert or update on public.characters
  for each row execute function public.enforce_west_marches_single_active_char();

-- ----------------------------------------------------------------------------
-- 5. West Marches Guild Quest Boards & Atomic Signups
-- ----------------------------------------------------------------------------
create table if not exists public.map_quest_boards (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  title text not null,
  description text not null default '',
  x numeric not null default 0,
  y numeric not null default 0,
  z numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.guild_quests (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.map_quest_boards(id) on delete cascade,
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  title text not null,
  summary text not null default '',
  danger_tier text not null default 'Standard',
  reward text not null default '',
  scheduled_at timestamptz,
  max_players integer not null default 5 check (max_players >= 1),
  status text not null default 'open' check (status in ('open', 'full', 'in_progress', 'completed', 'archived')),
  linked_entity_id uuid references public.entities(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guild_quest_signups (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.guild_quests(id) on delete cascade,
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  note text not null default '',
  signed_up_at timestamptz not null default now(),
  unique (quest_id, user_id)
);

create or replace function public.signup_for_guild_quest(
  p_quest_id uuid,
  p_character_id uuid,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_quest public.guild_quests%rowtype;
  v_count integer;
  v_signup_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_quest
  from public.guild_quests
  where id = p_quest_id
  for update;

  if not found then
    raise exception 'Guild quest not found';
  end if;

  if not public.is_campaign_member(v_quest.campaign_id) then
    raise exception 'Only campaign members can sign up for quests';
  end if;

  if v_quest.status <> 'open' then
    raise exception 'Quest is not open for signup (status: %)', v_quest.status;
  end if;

  if exists (
    select 1
    from public.guild_quest_signups s
    where s.quest_id = p_quest_id
      and s.user_id = v_uid
  ) then
    raise exception 'You have already signed up for this quest';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and c.user_id = v_uid
      and c.campaign_id = v_quest.campaign_id
      and c.is_active = true
  ) then
    raise exception 'Character must be an active character owned by you in this campaign';
  end if;

  select count(*)
  into v_count
  from public.guild_quest_signups s
  where s.quest_id = p_quest_id;

  if v_count >= v_quest.max_players then
    raise exception 'Quest party is already full';
  end if;

  insert into public.guild_quest_signups (quest_id, campaign_id, user_id, character_id, note)
  values (p_quest_id, v_quest.campaign_id, v_uid, p_character_id, coalesce(p_note, ''))
  returning id into v_signup_id;

  if v_count + 1 >= v_quest.max_players then
    update public.guild_quests
    set status = 'full',
        updated_at = now()
    where id = p_quest_id;
  end if;

  return v_signup_id;
end;
$$;

create or replace function public.withdraw_from_guild_quest(p_quest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_quest public.guild_quests%rowtype;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_quest
  from public.guild_quests
  where id = p_quest_id
  for update;

  if not found then
    raise exception 'Guild quest not found';
  end if;

  if not public.is_campaign_member(v_quest.campaign_id) then
    raise exception 'Only campaign members can withdraw from quests';
  end if;

  if v_quest.status in ('in_progress', 'completed', 'archived')
     and not public.is_campaign_gm(v_quest.campaign_id) then
    raise exception 'Cannot withdraw while quest status is %', v_quest.status;
  end if;

  delete from public.guild_quest_signups
  where quest_id = p_quest_id
    and user_id = v_uid;

  select count(*)
  into v_count
  from public.guild_quest_signups
  where quest_id = p_quest_id;

  if v_quest.status = 'full' and v_count < v_quest.max_players then
    update public.guild_quests
    set status = 'open',
        updated_at = now()
    where id = p_quest_id;
  end if;
end;
$$;

create or replace function public.handle_guild_quest_signup_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest public.guild_quests%rowtype;
  v_count integer;
begin
  select *
  into v_quest
  from public.guild_quests
  where id = old.quest_id
  for update;

  if found and v_quest.status = 'full' then
    select count(*)
    into v_count
    from public.guild_quest_signups
    where quest_id = old.quest_id;

    if v_count < v_quest.max_players then
      update public.guild_quests
      set status = 'open',
          updated_at = now()
      where id = old.quest_id;
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_guild_quest_signup_deleted on public.guild_quest_signups;
create trigger trg_guild_quest_signup_deleted
  after delete on public.guild_quest_signups
  for each row execute function public.handle_guild_quest_signup_deleted();

-- ----------------------------------------------------------------------------
-- 6. Player Journals & Granular Sharing (Strict Privacy)
-- ----------------------------------------------------------------------------
create table if not exists public.journal_pages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  tags text[] not null default '{}'::text[],
  share_scope text not null default 'private' check (share_scope in ('private', 'selected', 'campaign')),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_page_shares (
  page_id uuid not null references public.journal_pages(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  can_edit boolean not null default false,
  primary key (page_id, shared_with_user_id)
);

create or replace function public.is_journal_page_owner(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.journal_pages jp
    where jp.id = p_page_id
      and jp.owner_id = auth.uid()
  );
$$;

create or replace function public.is_user_in_journal_page_campaign(p_page_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.journal_pages jp
    join public.campaign_members cm on cm.campaign_id = jp.campaign_id
    where jp.id = p_page_id
      and cm.user_id = p_user_id
  );
$$;

create or replace function public.guard_journal_page_editor_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and old.owner_id is distinct from auth.uid()
     and (
       new.owner_id is distinct from old.owner_id
       or new.campaign_id is distinct from old.campaign_id
       or new.share_scope is distinct from old.share_scope
     ) then
    raise exception 'Only the journal page owner can change ownership, campaign, or share scope.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_journal_page_editor_update on public.journal_pages;
create trigger guard_journal_page_editor_update
  before update on public.journal_pages
  for each row execute function public.guard_journal_page_editor_update();

-- ----------------------------------------------------------------------------
-- 7. Per-Player Fog of War, Map Sharing, Dice Rolls & Timeline Events
-- ----------------------------------------------------------------------------
create table if not exists public.map_fog_states (
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  mask_url text not null default '',
  updated_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

create table if not exists public.map_fog_shares (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  share_all boolean not null default false,
  check (share_all = true or shared_with_user_id is not null)
);

create unique index if not exists uniq_map_fog_shares_user
  on public.map_fog_shares (map_id, owner_user_id, shared_with_user_id)
  where shared_with_user_id is not null;

create unique index if not exists uniq_map_fog_shares_all
  on public.map_fog_shares (map_id, owner_user_id)
  where share_all = true;

create table if not exists public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  label text not null default '',
  expression text not null,
  total integer not null,
  breakdown jsonb not null default '{}'::jsonb,
  is_gm_blind boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.worlds(id) on delete cascade,
  title text not null,
  date_label text not null default '',
  sort_order integer not null default 0,
  era text not null default '',
  description text not null default '',
  linked_entity_id uuid references public.entities(id) on delete set null,
  is_gm_only boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. Player Token Movement RPC (2D Battlemap)
-- ----------------------------------------------------------------------------
create or replace function public.move_my_battlemap_token(
  p_map_id uuid,
  p_token_id text,
  p_x numeric,
  p_y numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_map public.maps%rowtype;
  v_token jsonb;
  v_is_gm boolean;
  v_authorized boolean := false;
  v_updated_tokens jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_token_id is null or length(trim(p_token_id)) = 0 then
    raise exception 'Token ID cannot be empty';
  end if;

  if p_x is null or p_y is null
     or p_x = 'NaN'::numeric or p_x = 'Infinity'::numeric or p_x = '-Infinity'::numeric
     or p_y = 'NaN'::numeric or p_y = 'Infinity'::numeric or p_y = '-Infinity'::numeric then
    raise exception 'Token coordinates must be finite numbers';
  end if;

  select *
  into v_map
  from public.maps
  where id = p_map_id
  for update;

  if not found then
    raise exception 'Map not found';
  end if;

  if not public.is_campaign_member(v_map.world_id) then
    raise exception 'Only campaign members can interact with this map';
  end if;

  if v_map.battlemap is null
     or jsonb_typeof(v_map.battlemap) <> 'object'
     or jsonb_typeof(v_map.battlemap -> 'tokens') <> 'array' then
    raise exception 'Battlemap token list not found';
  end if;

  select elem
  into v_token
  from jsonb_array_elements(v_map.battlemap -> 'tokens') as elem
  where elem ->> 'id' = p_token_id
  limit 1;

  if v_token is null then
    raise exception 'Token not found on battlemap';
  end if;

  v_is_gm := public.is_campaign_gm(v_map.world_id);

  if v_is_gm then
    v_authorized := true;
  elsif (v_token ->> 'owner_user_id') = v_uid::text then
    v_authorized := true;
  elsif nullif(v_token ->> 'character_id', '') is not null then
    select exists (
      select 1
      from public.characters c
      where c.id::text = (v_token ->> 'character_id')
        and c.campaign_id = v_map.world_id
        and c.user_id = v_uid
    )
    into v_authorized;
  end if;

  if not v_authorized then
    raise exception 'You do not have permission to move this token';
  end if;

  if not v_is_gm and coalesce((v_token ->> 'isHidden')::boolean, false) then
    raise exception 'Hidden tokens can only be moved by a GM.'
      using errcode = '42501';
  end if;

  select jsonb_agg(
    case
      when elem ->> 'id' = p_token_id then
        elem || jsonb_build_object('x', p_x, 'y', p_y)
      else elem
    end
  )
  into v_updated_tokens
  from jsonb_array_elements(v_map.battlemap -> 'tokens') as elem;

  update public.maps
  set battlemap = jsonb_set(v_map.battlemap, '{tokens}', coalesce(v_updated_tokens, '[]'::jsonb), true)
  where id = p_map_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Table Privileges, RLS Enablement & Policies (Authenticated-Only)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'worlds',
    'campaign_members',
    'entities',
    'entity_links',
    'maps',
    'map_pins',
    'map_paths',
    'vault_assets',
    'entity_templates',
    'character_sheet_templates',
    'characters',
    'map_quest_boards',
    'guild_quests',
    'guild_quest_signups',
    'journal_pages',
    'journal_page_shares',
    'map_fog_states',
    'map_fog_shares',
    'dice_rolls',
    'timeline_events'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon;', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- worlds
drop policy if exists "worlds_select_member" on public.worlds;
drop policy if exists "worlds_insert_owner" on public.worlds;
drop policy if exists "worlds_update_gm" on public.worlds;
drop policy if exists "worlds_delete_owner_or_gm" on public.worlds;
drop policy if exists "worlds_delete_owner" on public.worlds;

create policy "worlds_select_member" on public.worlds
  for select to authenticated
  using (owner_id = auth.uid() or public.is_campaign_member(id));

create policy "worlds_insert_owner" on public.worlds
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "worlds_update_gm" on public.worlds
  for update to authenticated
  using (public.is_campaign_gm(id))
  with check (public.is_campaign_gm(id));

create policy "worlds_delete_owner" on public.worlds
  for delete to authenticated
  using (owner_id = auth.uid());

-- campaign_members
drop policy if exists "campaign_members_select_member" on public.campaign_members;
drop policy if exists "campaign_members_insert_gm" on public.campaign_members;
drop policy if exists "campaign_members_update_gm" on public.campaign_members;
drop policy if exists "campaign_members_delete_gm_or_self" on public.campaign_members;

create policy "campaign_members_select_member" on public.campaign_members
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "campaign_members_insert_gm" on public.campaign_members
  for insert to authenticated
  with check (
    public.is_campaign_gm(campaign_id)
    and (
      role <> 'gm'
      or public.is_campaign_primary_gm(campaign_id)
    )
  );

create policy "campaign_members_update_gm" on public.campaign_members
  for update to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    and (
      not exists (
        select 1 from public.worlds w
        where w.id = campaign_id
          and w.owner_id = campaign_members.user_id
      )
      or exists (
        select 1 from public.worlds w
        where w.id = campaign_id
          and w.owner_id = auth.uid()
      )
    )
    and (
      role <> 'gm'
      or public.is_campaign_primary_gm(campaign_id)
    )
  )
  with check (
    public.is_campaign_gm(campaign_id)
    and (
      not exists (
        select 1 from public.worlds w
        where w.id = campaign_id
          and w.owner_id = campaign_members.user_id
      )
      or exists (
        select 1 from public.worlds w
        where w.id = campaign_id
          and w.owner_id = auth.uid()
      )
    )
    and (
      role <> 'gm'
      or public.is_campaign_primary_gm(campaign_id)
    )
  );

create policy "campaign_members_delete_gm_or_self" on public.campaign_members
  for delete to authenticated
  using (
    (
      not exists (
        select 1 from public.worlds w
        where w.id = campaign_id
          and w.owner_id = campaign_members.user_id
      )
      or exists (
        select 1 from public.worlds w
        where w.id = campaign_id
          and w.owner_id = auth.uid()
      )
    )
    and (
      user_id = auth.uid()
      or (
        public.is_campaign_gm(campaign_id)
        and (
          role <> 'gm'
          or public.is_campaign_primary_gm(campaign_id)
        )
      )
    )
  );

-- entities
drop policy if exists "entities_select_member" on public.entities;
drop policy if exists "entities_insert_gm" on public.entities;
drop policy if exists "entities_update_gm" on public.entities;
drop policy if exists "entities_delete_gm" on public.entities;

create policy "entities_select_member" on public.entities
  for select to authenticated
  using (public.is_campaign_member(world_id));

create policy "entities_insert_gm" on public.entities
  for insert to authenticated
  with check (public.is_campaign_gm(world_id));

create policy "entities_update_gm" on public.entities
  for update to authenticated
  using (public.is_campaign_gm(world_id))
  with check (public.is_campaign_gm(world_id));

create policy "entities_delete_gm" on public.entities
  for delete to authenticated
  using (public.is_campaign_gm(world_id));

-- entity_links
drop policy if exists "entity_links_select_member" on public.entity_links;
drop policy if exists "entity_links_insert_gm" on public.entity_links;
drop policy if exists "entity_links_update_gm" on public.entity_links;
drop policy if exists "entity_links_delete_gm" on public.entity_links;

create policy "entity_links_select_member" on public.entity_links
  for select to authenticated
  using (public.is_campaign_member(world_id));

create policy "entity_links_insert_gm" on public.entity_links
  for insert to authenticated
  with check (public.is_campaign_gm(world_id));

create policy "entity_links_update_gm" on public.entity_links
  for update to authenticated
  using (public.is_campaign_gm(world_id))
  with check (public.is_campaign_gm(world_id));

create policy "entity_links_delete_gm" on public.entity_links
  for delete to authenticated
  using (public.is_campaign_gm(world_id));

-- maps
drop policy if exists "maps_select_member" on public.maps;
drop policy if exists "maps_insert_gm" on public.maps;
drop policy if exists "maps_update_gm" on public.maps;
drop policy if exists "maps_delete_gm" on public.maps;

create policy "maps_select_member" on public.maps
  for select to authenticated
  using (public.is_campaign_member(world_id));

create policy "maps_insert_gm" on public.maps
  for insert to authenticated
  with check (public.is_campaign_gm(world_id));

create policy "maps_update_gm" on public.maps
  for update to authenticated
  using (public.is_campaign_gm(world_id))
  with check (public.is_campaign_gm(world_id));

create policy "maps_delete_gm" on public.maps
  for delete to authenticated
  using (public.is_campaign_gm(world_id));

-- map_pins
drop policy if exists "map_pins_select_visible" on public.map_pins;
drop policy if exists "map_pins_insert_gm" on public.map_pins;
drop policy if exists "map_pins_update_gm" on public.map_pins;
drop policy if exists "map_pins_delete_gm" on public.map_pins;

create policy "map_pins_select_visible" on public.map_pins
  for select to authenticated
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_id
        and (
          public.is_campaign_gm(m.world_id)
          or (public.is_campaign_member(m.world_id) and not is_gm_only)
        )
    )
  );

create policy "map_pins_insert_gm" on public.map_pins
  for insert to authenticated
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  );

create policy "map_pins_update_gm" on public.map_pins
  for update to authenticated
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  )
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  );

create policy "map_pins_delete_gm" on public.map_pins
  for delete to authenticated
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  );

-- map_paths
drop policy if exists "map_paths_select_visible" on public.map_paths;
drop policy if exists "map_paths_insert_gm" on public.map_paths;
drop policy if exists "map_paths_update_gm" on public.map_paths;
drop policy if exists "map_paths_delete_gm" on public.map_paths;

create policy "map_paths_select_visible" on public.map_paths
  for select to authenticated
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_id
        and (
          public.is_campaign_gm(m.world_id)
          or (public.is_campaign_member(m.world_id) and not is_gm_only)
        )
    )
  );

create policy "map_paths_insert_gm" on public.map_paths
  for insert to authenticated
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  );

create policy "map_paths_update_gm" on public.map_paths
  for update to authenticated
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  )
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  );

create policy "map_paths_delete_gm" on public.map_paths
  for delete to authenticated
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_id and public.is_campaign_gm(m.world_id)
    )
  );

-- vault_assets
drop policy if exists "vault_assets_select_member" on public.vault_assets;
drop policy if exists "vault_assets_insert_gm" on public.vault_assets;
drop policy if exists "vault_assets_update_gm" on public.vault_assets;
drop policy if exists "vault_assets_delete_gm" on public.vault_assets;

create policy "vault_assets_select_member" on public.vault_assets
  for select to authenticated
  using (public.is_campaign_member(world_id));

create policy "vault_assets_insert_gm" on public.vault_assets
  for insert to authenticated
  with check (public.is_campaign_gm(world_id));

create policy "vault_assets_update_gm" on public.vault_assets
  for update to authenticated
  using (public.is_campaign_gm(world_id))
  with check (public.is_campaign_gm(world_id));

create policy "vault_assets_delete_gm" on public.vault_assets
  for delete to authenticated
  using (public.is_campaign_gm(world_id));

-- entity_templates
drop policy if exists "entity_templates_select_member" on public.entity_templates;
drop policy if exists "entity_templates_insert_gm" on public.entity_templates;
drop policy if exists "entity_templates_update_gm" on public.entity_templates;
drop policy if exists "entity_templates_delete_gm" on public.entity_templates;

create policy "entity_templates_select_member" on public.entity_templates
  for select to authenticated
  using (public.is_campaign_member(world_id));

create policy "entity_templates_insert_gm" on public.entity_templates
  for insert to authenticated
  with check (public.is_campaign_gm(world_id));

create policy "entity_templates_update_gm" on public.entity_templates
  for update to authenticated
  using (public.is_campaign_gm(world_id))
  with check (public.is_campaign_gm(world_id));

create policy "entity_templates_delete_gm" on public.entity_templates
  for delete to authenticated
  using (public.is_campaign_gm(world_id));

-- character_sheet_templates
drop policy if exists "sheet_templates_select_member" on public.character_sheet_templates;
drop policy if exists "sheet_templates_insert_gm" on public.character_sheet_templates;
drop policy if exists "sheet_templates_update_gm" on public.character_sheet_templates;
drop policy if exists "sheet_templates_delete_gm" on public.character_sheet_templates;

create policy "sheet_templates_select_member" on public.character_sheet_templates
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "sheet_templates_insert_gm" on public.character_sheet_templates
  for insert to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "sheet_templates_update_gm" on public.character_sheet_templates
  for update to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

create policy "sheet_templates_delete_gm" on public.character_sheet_templates
  for delete to authenticated
  using (public.is_campaign_gm(campaign_id));

-- characters
drop policy if exists "characters_select_member" on public.characters;
drop policy if exists "characters_insert_owner_or_gm" on public.characters;
drop policy if exists "characters_update_owner_or_gm" on public.characters;
drop policy if exists "characters_delete_owner_or_gm" on public.characters;

create policy "characters_select_member" on public.characters
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "characters_insert_owner_or_gm" on public.characters
  for insert to authenticated
  with check (
    public.is_campaign_gm(campaign_id)
    or (public.is_campaign_member(campaign_id) and user_id = auth.uid())
  );

create policy "characters_update_owner_or_gm" on public.characters
  for update to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or (public.is_campaign_member(campaign_id) and user_id = auth.uid())
  )
  with check (
    public.is_campaign_gm(campaign_id)
    or (public.is_campaign_member(campaign_id) and user_id = auth.uid())
  );

create policy "characters_delete_owner_or_gm" on public.characters
  for delete to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or (public.is_campaign_member(campaign_id) and user_id = auth.uid())
  );

-- map_quest_boards
drop policy if exists "quest_boards_select_member" on public.map_quest_boards;
drop policy if exists "quest_boards_insert_gm" on public.map_quest_boards;
drop policy if exists "quest_boards_update_gm" on public.map_quest_boards;
drop policy if exists "quest_boards_delete_gm" on public.map_quest_boards;

create policy "quest_boards_select_member" on public.map_quest_boards
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "quest_boards_insert_gm" on public.map_quest_boards
  for insert to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "quest_boards_update_gm" on public.map_quest_boards
  for update to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

create policy "quest_boards_delete_gm" on public.map_quest_boards
  for delete to authenticated
  using (public.is_campaign_gm(campaign_id));

-- guild_quests
drop policy if exists "guild_quests_select_member" on public.guild_quests;
drop policy if exists "guild_quests_insert_gm" on public.guild_quests;
drop policy if exists "guild_quests_update_gm" on public.guild_quests;
drop policy if exists "guild_quests_delete_gm" on public.guild_quests;

create policy "guild_quests_select_member" on public.guild_quests
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "guild_quests_insert_gm" on public.guild_quests
  for insert to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "guild_quests_update_gm" on public.guild_quests
  for update to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

create policy "guild_quests_delete_gm" on public.guild_quests
  for delete to authenticated
  using (public.is_campaign_gm(campaign_id));

-- guild_quest_signups
drop policy if exists "guild_quest_signups_select_member" on public.guild_quest_signups;
drop policy if exists "guild_quest_signups_insert_gm" on public.guild_quest_signups;
drop policy if exists "guild_quest_signups_update_gm" on public.guild_quest_signups;
drop policy if exists "guild_quest_signups_delete_owner_or_gm" on public.guild_quest_signups;

create policy "guild_quest_signups_select_member" on public.guild_quest_signups
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "guild_quest_signups_insert_gm" on public.guild_quest_signups
  for insert to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "guild_quest_signups_update_gm" on public.guild_quest_signups
  for update to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

create policy "guild_quest_signups_delete_owner_or_gm" on public.guild_quest_signups
  for delete to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.guild_quests q
        where q.id = quest_id
          and q.status in ('open', 'full')
      )
    )
  );

-- journal_pages (strict privacy: no GM bypass on private notes)
drop policy if exists "journal_pages_select_shared" on public.journal_pages;
drop policy if exists "journal_pages_insert_owner" on public.journal_pages;
drop policy if exists "journal_pages_update_owner_or_editor" on public.journal_pages;
drop policy if exists "journal_pages_delete_owner" on public.journal_pages;

create policy "journal_pages_select_shared" on public.journal_pages
  for select to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      owner_id = auth.uid()
      or share_scope = 'campaign'
      or (
        share_scope = 'selected'
        and exists (
          select 1 from public.journal_page_shares s
          where s.page_id = id
            and s.shared_with_user_id = auth.uid()
        )
      )
    )
  );

create policy "journal_pages_insert_owner" on public.journal_pages
  for insert to authenticated
  with check (
    public.is_campaign_member(campaign_id)
    and owner_id = auth.uid()
  );

create policy "journal_pages_update_owner_or_editor" on public.journal_pages
  for update to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (
      owner_id = auth.uid()
      or (
        share_scope = 'selected'
        and exists (
          select 1 from public.journal_page_shares s
          where s.page_id = id
            and s.shared_with_user_id = auth.uid()
            and s.can_edit = true
        )
      )
    )
  )
  with check (
    public.is_campaign_member(campaign_id)
    and (
      owner_id = auth.uid()
      or (
        share_scope = 'selected'
        and exists (
          select 1 from public.journal_page_shares s
          where s.page_id = id
            and s.shared_with_user_id = auth.uid()
            and s.can_edit = true
        )
      )
    )
  );

create policy "journal_pages_delete_owner" on public.journal_pages
  for delete to authenticated
  using (owner_id = auth.uid());

-- journal_page_shares
drop policy if exists "journal_page_shares_select_visible" on public.journal_page_shares;
drop policy if exists "journal_page_shares_insert_owner" on public.journal_page_shares;
drop policy if exists "journal_page_shares_update_owner" on public.journal_page_shares;
drop policy if exists "journal_page_shares_delete_owner" on public.journal_page_shares;

create policy "journal_page_shares_select_visible" on public.journal_page_shares
  for select to authenticated
  using (
    public.is_journal_page_owner(page_id)
    or (
      shared_with_user_id = auth.uid()
      and public.is_user_in_journal_page_campaign(page_id, auth.uid())
    )
  );

create policy "journal_page_shares_insert_owner" on public.journal_page_shares
  for insert to authenticated
  with check (
    public.is_journal_page_owner(page_id)
    and public.is_user_in_journal_page_campaign(page_id, shared_with_user_id)
  );

create policy "journal_page_shares_update_owner" on public.journal_page_shares
  for update to authenticated
  using (public.is_journal_page_owner(page_id))
  with check (
    public.is_journal_page_owner(page_id)
    and public.is_user_in_journal_page_campaign(page_id, shared_with_user_id)
  );

create policy "journal_page_shares_delete_owner" on public.journal_page_shares
  for delete to authenticated
  using (public.is_journal_page_owner(page_id));

-- map_fog_states
drop policy if exists "map_fog_states_select_shared" on public.map_fog_states;
drop policy if exists "map_fog_states_insert_gm" on public.map_fog_states;
drop policy if exists "map_fog_states_update_gm" on public.map_fog_states;
drop policy if exists "map_fog_states_delete_gm" on public.map_fog_states;

create policy "map_fog_states_select_shared" on public.map_fog_states
  for select to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or user_id = auth.uid()
    or (
      public.is_campaign_member(campaign_id)
      and exists (
        select 1 from public.map_fog_shares s
        where s.map_id = map_fog_states.map_id
          and s.campaign_id = map_fog_states.campaign_id
          and s.owner_user_id = map_fog_states.user_id
          and (s.share_all = true or s.shared_with_user_id = auth.uid())
      )
    )
  );

create policy "map_fog_states_insert_gm" on public.map_fog_states
  for insert to authenticated
  with check (
    public.is_campaign_gm(campaign_id)
    and exists (
      select 1 from public.maps m
      where m.id = map_id and m.world_id = campaign_id
    )
    and exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = map_fog_states.campaign_id
        and cm.user_id = map_fog_states.user_id
    )
  );

create policy "map_fog_states_update_gm" on public.map_fog_states
  for update to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (
    public.is_campaign_gm(campaign_id)
    and exists (
      select 1 from public.maps m
      where m.id = map_id and m.world_id = campaign_id
    )
    and exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = map_fog_states.campaign_id
        and cm.user_id = map_fog_states.user_id
    )
  );

create policy "map_fog_states_delete_gm" on public.map_fog_states
  for delete to authenticated
  using (public.is_campaign_gm(campaign_id));

-- map_fog_shares
drop policy if exists "map_fog_shares_select_member" on public.map_fog_shares;
drop policy if exists "map_fog_shares_insert_owner_or_gm" on public.map_fog_shares;
drop policy if exists "map_fog_shares_update_owner_or_gm" on public.map_fog_shares;
drop policy if exists "map_fog_shares_delete_owner_or_gm" on public.map_fog_shares;

create policy "map_fog_shares_select_member" on public.map_fog_shares
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "map_fog_shares_insert_owner_or_gm" on public.map_fog_shares
  for insert to authenticated
  with check (
    (
      (public.is_campaign_member(campaign_id) and owner_user_id = auth.uid())
      or public.is_campaign_gm(campaign_id)
    )
    and exists (
      select 1 from public.maps m
      where m.id = map_id and m.world_id = campaign_id
    )
    and exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = map_fog_shares.campaign_id
        and cm.user_id = map_fog_shares.owner_user_id
    )
    and (
      shared_with_user_id is null
      or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = map_fog_shares.campaign_id
          and cm.user_id = map_fog_shares.shared_with_user_id
      )
    )
  );

create policy "map_fog_shares_update_owner_or_gm" on public.map_fog_shares
  for update to authenticated
  using (
    (public.is_campaign_member(campaign_id) and owner_user_id = auth.uid())
    or public.is_campaign_gm(campaign_id)
  )
  with check (
    (
      (public.is_campaign_member(campaign_id) and owner_user_id = auth.uid())
      or public.is_campaign_gm(campaign_id)
    )
    and exists (
      select 1 from public.maps m
      where m.id = map_id and m.world_id = campaign_id
    )
    and exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = map_fog_shares.campaign_id
        and cm.user_id = map_fog_shares.owner_user_id
    )
    and (
      shared_with_user_id is null
      or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = map_fog_shares.campaign_id
          and cm.user_id = map_fog_shares.shared_with_user_id
      )
    )
  );

create policy "map_fog_shares_delete_owner_or_gm" on public.map_fog_shares
  for delete to authenticated
  using (
    (public.is_campaign_member(campaign_id) and owner_user_id = auth.uid())
    or public.is_campaign_gm(campaign_id)
  );

-- dice_rolls
drop policy if exists "dice_rolls_select_visible" on public.dice_rolls;
drop policy if exists "dice_rolls_insert_member" on public.dice_rolls;
drop policy if exists "dice_rolls_delete_owner_or_gm" on public.dice_rolls;

create policy "dice_rolls_select_visible" on public.dice_rolls
  for select to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or (
      public.is_campaign_member(campaign_id)
      and (not is_gm_blind or user_id = auth.uid())
    )
  );

create policy "dice_rolls_insert_member" on public.dice_rolls
  for insert to authenticated
  with check (
    public.is_campaign_member(campaign_id)
    and user_id = auth.uid()
    and (not is_gm_blind or public.is_campaign_gm(campaign_id))
  );

create policy "dice_rolls_delete_owner_or_gm" on public.dice_rolls
  for delete to authenticated
  using (public.is_campaign_gm(campaign_id) or user_id = auth.uid());

-- timeline_events
drop policy if exists "timeline_events_select_visible" on public.timeline_events;
drop policy if exists "timeline_events_insert_gm" on public.timeline_events;
drop policy if exists "timeline_events_update_gm" on public.timeline_events;
drop policy if exists "timeline_events_delete_gm" on public.timeline_events;

create policy "timeline_events_select_visible" on public.timeline_events
  for select to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or (public.is_campaign_member(campaign_id) and not is_gm_only)
  );

create policy "timeline_events_insert_gm" on public.timeline_events
  for insert to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "timeline_events_update_gm" on public.timeline_events
  for update to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

create policy "timeline_events_delete_gm" on public.timeline_events
  for delete to authenticated
  using (public.is_campaign_gm(campaign_id));

-- ----------------------------------------------------------------------------
-- 10. Function Execution Grants
-- ----------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon;
grant execute on function
  public.is_campaign_member(uuid),
  public.is_campaign_gm(uuid),
  public.is_campaign_primary_gm(uuid),
  public.is_journal_page_owner(uuid),
  public.is_user_in_journal_page_campaign(uuid, uuid),
  public.join_campaign_by_invite(text),
  public.signup_for_guild_quest(uuid, uuid, text),
  public.withdraw_from_guild_quest(uuid),
  public.move_my_battlemap_token(uuid, text, numeric, numeric)
to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Supabase Realtime Publication
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'worlds',
      'campaign_members',
      'entities',
      'entity_links',
      'maps',
      'map_pins',
      'map_paths',
      'vault_assets',
      'entity_templates',
      'character_sheet_templates',
      'characters',
      'map_quest_boards',
      'guild_quests',
      'guild_quest_signups',
      'journal_pages',
      'journal_page_shares',
      'map_fog_states',
      'map_fog_shares',
      'dice_rolls',
      'timeline_events'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 12. Storage Bucket & Policies (vault-assets)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vault-assets', 'vault-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "vault_assets_public_read" on storage.objects
  for select
  using (bucket_id = 'vault-assets');

create policy "vault_assets_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vault-assets' and auth.role() = 'authenticated');

create policy "vault_assets_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'vault-assets' and auth.role() = 'authenticated')
  with check (bucket_id = 'vault-assets' and auth.role() = 'authenticated');

create policy "vault_assets_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault-assets' and auth.role() = 'authenticated');
