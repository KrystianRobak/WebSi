-- ============================================================================
-- Aethelgard Vault — Shared-Token Multi-Device Schema, RLS, Storage & Probe
-- ============================================================================

create extension if not exists "pgcrypto";

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table if not exists private.vault_credentials (
  id text primary key,
  salt text not null,
  token_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on table private.vault_credentials from public, anon, authenticated;

-- 1. Worlds (nullable owner_id so no auth.users account is required)
create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Entities
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

-- 3. Entity Links
create table if not exists public.entity_links (
  source_id uuid not null references public.entities(id) on delete cascade,
  target_id uuid not null references public.entities(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  primary key (source_id, target_id)
);

-- 4. Maps (3D Worldsmith + 2D Tactical Battlemaps)
create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  name text not null,
  kind text not null default '3d',
  albedo_url text,
  heightmap_url text,
  width integer not null default 8192,
  height integer not null default 8192,
  displacement_scale numeric not null default 12.5,
  scale_config jsonb not null default '{"ratio":"1 : 250 000","elevationSource":"Heightmap (32-bit)","kmPerUnit":1.8}'::jsonb,
  generation_config jsonb,
  atmosphere text,
  rivers jsonb not null default '[]'::jsonb,
  props jsonb not null default '[]'::jsonb,
  layers jsonb not null default '[]'::jsonb,
  zones jsonb not null default '[]'::jsonb,
  labels jsonb not null default '[]'::jsonb,
  battlemap jsonb,
  created_at timestamptz not null default now()
);

-- 5. Map Pins
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

-- 6. Map Paths
create table if not exists public.map_paths (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  name text not null,
  points jsonb not null default '[]'::jsonb,
  style text not null default 'dashed-gold',
  is_gm_only boolean not null default false,
  created_at timestamptz not null default now()
);

-- 7. Vault Assets
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

-- 8. Entity Templates
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

-- 9. Single-row token verification probe
create table if not exists public.vault_probe (
  id integer primary key
);
insert into public.vault_probe (id) values (1) on conflict (id) do nothing;

-- Token verification helper in private schema
create or replace function private.has_valid_vault_token()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.vault_credentials vc
    where vc.id = 'master'
      and encode(
        extensions.digest(
          vc.salt || coalesce(
            nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-vault-token',
            ''
          ),
          'sha256'
        ),
        'hex'
      ) = vc.token_hash
  );
$$;
revoke all on function private.has_valid_vault_token() from public;
grant execute on function private.has_valid_vault_token() to anon, authenticated;

-- Set/rotate your Vault Access Token cleanly via SQL Editor:
-- with s as (select encode(extensions.gen_random_bytes(16), 'hex') as salt)
-- insert into private.vault_credentials (id, salt, token_hash)
-- select 'master', s.salt, encode(extensions.digest(s.salt || 'YOUR_MEMORABLE_TOKEN', 'sha256'), 'hex') from s
-- on conflict (id) do update set salt = excluded.salt, token_hash = excluded.token_hash, updated_at = now();

-- Grants + RLS
grant select, insert, update, delete on
  public.worlds,
  public.entities,
  public.entity_links,
  public.maps,
  public.map_pins,
  public.map_paths,
  public.vault_assets,
  public.entity_templates
to anon, authenticated;
grant select on public.vault_probe to anon, authenticated;

alter table public.worlds enable row level security;
alter table public.entities enable row level security;
alter table public.entity_links enable row level security;
alter table public.maps enable row level security;
alter table public.map_pins enable row level security;
alter table public.map_paths enable row level security;
alter table public.vault_assets enable row level security;
alter table public.entity_templates enable row level security;
alter table public.vault_probe enable row level security;

create policy "worlds_token_all" on public.worlds
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "entities_token_all" on public.entities
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "entity_links_token_all" on public.entity_links
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "maps_token_all" on public.maps
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "map_pins_token_all" on public.map_pins
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "map_paths_token_all" on public.map_paths
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "vault_assets_token_all" on public.vault_assets
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "entity_templates_token_all" on public.entity_templates
  for all to anon, authenticated
  using ((select private.has_valid_vault_token()))
  with check ((select private.has_valid_vault_token()));

create policy "vault_probe_token_select" on public.vault_probe
  for select to anon, authenticated
  using ((select private.has_valid_vault_token()));

-- Storage Bucket
insert into storage.buckets (id, name, public)
values ('vault-assets', 'vault-assets', true)
on conflict (id) do nothing;

create policy "vault_assets_public_read" on storage.objects
  for select using (bucket_id = 'vault-assets');

create policy "vault_assets_token_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'vault-assets' and (select private.has_valid_vault_token()));

create policy "vault_assets_token_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'vault-assets' and (select private.has_valid_vault_token()))
  with check (bucket_id = 'vault-assets' and (select private.has_valid_vault_token()));

create policy "vault_assets_token_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'vault-assets' and (select private.has_valid_vault_token()));
