-- ============================================================================
-- Aethelgard Vault — Full Multi-Device Schema, RLS, Indexes, Realtime & Storage
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Worlds
create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Entities (Characters, Locations, Factions, Sessions, Lore, etc.)
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

-- 3. Entity Links (Bidirectional WikiLink graph edges)
create table if not exists public.entity_links (
  source_id uuid not null references public.entities(id) on delete cascade,
  target_id uuid not null references public.entities(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  primary key (source_id, target_id)
);

-- 4. Maps (3D Worldsmith Heightmaps/Rivers/Props + 2D Tactical Battlemaps)
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
  battlemap jsonb,
  created_at timestamptz not null default now()
);

-- 5. Map Pins (3D Coordinates bound to Entities)
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

-- 6. Map Paths & Regions
create table if not exists public.map_paths (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  name text not null,
  points jsonb not null default '[]'::jsonb,
  style text not null default 'dashed-gold',
  is_gm_only boolean not null default false,
  created_at timestamptz not null default now()
);

-- 7. Vault Assets (![[asset-slug]] gallery & portraits)
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

-- 8. Custom Encyclopedia & Note Templates per World
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

-- ============================================================================
-- Indexes for Foreign Keys & RLS Ownership Lookups
-- ============================================================================
create index if not exists worlds_owner_id_idx on public.worlds (owner_id);
create index if not exists entities_world_id_idx on public.entities (world_id);
create index if not exists entity_links_world_id_idx on public.entity_links (world_id);
create index if not exists entity_links_target_id_idx on public.entity_links (target_id);
create index if not exists maps_world_id_idx on public.maps (world_id);
create index if not exists map_pins_map_id_idx on public.map_pins (map_id);
create index if not exists map_pins_entity_id_idx on public.map_pins (entity_id);
create index if not exists map_paths_map_id_idx on public.map_paths (map_id);
create index if not exists vault_assets_world_id_idx on public.vault_assets (world_id);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
alter table public.worlds enable row level security;
alter table public.entities enable row level security;
alter table public.entity_links enable row level security;
alter table public.maps enable row level security;
alter table public.map_pins enable row level security;
alter table public.map_paths enable row level security;
alter table public.vault_assets enable row level security;
alter table public.entity_templates enable row level security;

drop policy if exists "worlds_owner_all" on public.worlds;
create policy "worlds_owner_all" on public.worlds
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "entities_owner_all" on public.entities;
create policy "entities_owner_all" on public.entities
  for all to authenticated
  using (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  );

drop policy if exists "entity_links_owner_all" on public.entity_links;
create policy "entity_links_owner_all" on public.entity_links
  for all to authenticated
  using (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  );

drop policy if exists "maps_owner_all" on public.maps;
create policy "maps_owner_all" on public.maps
  for all to authenticated
  using (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  );

drop policy if exists "map_pins_owner_all" on public.map_pins;
create policy "map_pins_owner_all" on public.map_pins
  for all to authenticated
  using (
    exists (
      select 1 from public.maps m
      join public.worlds w on w.id = m.world_id
      where m.id = map_id and w.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.maps m
      join public.worlds w on w.id = m.world_id
      where m.id = map_id and w.owner_id = (select auth.uid())
    )
  );

drop policy if exists "map_paths_owner_all" on public.map_paths;
create policy "map_paths_owner_all" on public.map_paths
  for all to authenticated
  using (
    exists (
      select 1 from public.maps m
      join public.worlds w on w.id = m.world_id
      where m.id = map_id and w.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.maps m
      join public.worlds w on w.id = m.world_id
      where m.id = map_id and w.owner_id = (select auth.uid())
    )
  );

drop policy if exists "vault_assets_owner_all" on public.vault_assets;
create policy "vault_assets_owner_all" on public.vault_assets
  for all to authenticated
  using (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  );

drop policy if exists "entity_templates_owner_all" on public.entity_templates;
create policy "entity_templates_owner_all" on public.entity_templates
  for all to authenticated
  using (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = (select auth.uid()))
  );

-- ============================================================================
-- Realtime Publication
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'worlds',
    'entities',
    'entity_links',
    'maps',
    'map_pins',
    'map_paths',
    'vault_assets',
    'entity_templates'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- Storage Bucket for Maps, Portraits & Asset Gallery
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('vault-assets', 'vault-assets', true)
on conflict (id) do nothing;

drop policy if exists "vault_assets_public_read" on storage.objects;
create policy "vault_assets_public_read" on storage.objects
  for select using (bucket_id = 'vault-assets');

drop policy if exists "vault_assets_auth_select" on storage.objects;
create policy "vault_assets_auth_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'vault-assets');

drop policy if exists "vault_assets_auth_insert" on storage.objects;
create policy "vault_assets_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vault-assets');

drop policy if exists "vault_assets_auth_update" on storage.objects;
create policy "vault_assets_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'vault-assets')
  with check (bucket_id = 'vault-assets');

drop policy if exists "vault_assets_auth_delete" on storage.objects;
create policy "vault_assets_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault-assets');
