import {
  generateEntityArtwork,
  generateShatteredReachTerrain,
  sampleTerrainElevation,
  DEFAULT_DISPLACEMENT,
} from '../lib/terrainGenerator';
import { DEFAULT_NEW_WORLD_SIZE, heightResForWorldSize } from '../lib/worldEnvironment';
import { createDefaultWorldLayers } from '../lib/worldLayers';
import { computeAllEntityLinks } from '../lib/wikilinks';
import {
  CampaignCalendarConfig,
  Entity,
  EntityLink,
  MapPath,
  MapPin,
  TabItem,
  VaultAsset,
  VaultMap,
  World,
  WorldMapLabel,
  WorldMapZone,
} from '../types/vault';

export const DEMO_WORLD_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_MAP_ID = '22222222-2222-4222-8222-222222222222';

export const DEFAULT_CALENDAR_CONFIG: CampaignCalendarConfig = {
  eraName: 'Age of Cinders',
  currentYear: 412,
  currentMonthIndex: 0,
  currentDay: 14,
  months: [
    { name: 'Embertide', days: 30 },
    { name: 'Frostwane', days: 30 },
    { name: 'Shoalbloom', days: 30 },
    { name: 'Sunspear', days: 30 },
    { name: 'Stormreach', days: 30 },
    { name: 'Duskfall', days: 30 },
  ],
  weekdays: ['Moonday', 'Tidewatch', 'Ashday', 'Gilded', 'Starfall', 'Saltrest'],
};

export function normalizeCalendarConfig(raw: unknown): CampaignCalendarConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_CALENDAR_CONFIG;
  const r = raw as Record<string, unknown>;

  const rawMonths = Array.isArray(r.months) ? r.months : [];
  const months =
    rawMonths.length > 0
      ? rawMonths
          .map((m, idx) => {
            if (typeof m === 'string') {
              return { name: m.trim() || `Month ${idx + 1}`, days: 30 };
            }
            if (m && typeof m === 'object') {
              const obj = m as Record<string, unknown>;
              const name =
                typeof obj.name === 'string' && obj.name.trim()
                  ? obj.name.trim()
                  : `Month ${idx + 1}`;
              const rawDays = Number(obj.days);
              const days = Number.isFinite(rawDays) && rawDays >= 1 ? Math.floor(rawDays) : 30;
              return { name, days };
            }
            return null;
          })
          .filter((m): m is { name: string; days: number } => Boolean(m))
      : DEFAULT_CALENDAR_CONFIG.months;

  const safeMonths = months.length > 0 ? months : DEFAULT_CALENDAR_CONFIG.months;

  const rawWeekdays = Array.isArray(r.weekdays)
    ? r.weekdays.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    : [];
  const weekdays = rawWeekdays.length > 0 ? rawWeekdays : DEFAULT_CALENDAR_CONFIG.weekdays;

  const eraName =
    typeof r.eraName === 'string' && r.eraName.trim()
      ? r.eraName.trim()
      : typeof r.era === 'string' && r.era.trim()
        ? r.era.trim()
        : DEFAULT_CALENDAR_CONFIG.eraName;

  const rawYear = Number(r.currentYear);
  const currentYear =
    Number.isFinite(rawYear) && rawYear >= 1 ? Math.floor(rawYear) : DEFAULT_CALENDAR_CONFIG.currentYear;

  const rawMonthIdx =
    r.currentMonthIndex !== undefined
      ? Number(r.currentMonthIndex)
      : r.currentMonth !== undefined
        ? Number(r.currentMonth) - 1
        : DEFAULT_CALENDAR_CONFIG.currentMonthIndex;
  const currentMonthIndex = Number.isFinite(rawMonthIdx)
    ? Math.max(0, Math.min(safeMonths.length - 1, Math.floor(rawMonthIdx)))
    : 0;

  const maxDay = safeMonths[currentMonthIndex]?.days || 30;
  const rawDay = Number(r.currentDay);
  const currentDay =
    Number.isFinite(rawDay) && rawDay >= 1
      ? Math.min(maxDay, Math.floor(rawDay))
      : DEFAULT_CALENDAR_CONFIG.currentDay;

  return {
    eraName,
    currentYear,
    currentMonthIndex,
    currentDay,
    months: safeMonths,
    weekdays,
  };
}

export function buildSeedAssets(): VaultAsset[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'asset-oakhaven-harbor',
      slug: 'oakhaven-harbor',
      name: 'Oakhaven Harbor',
      url: generateEntityArtwork('#d4a853', 'harbor'),
      kind: 'scene',
      created_at: now,
    },
    {
      id: 'asset-ashen-spire',
      slug: 'ashen-spire-peak',
      name: 'Ashen Spire Citadel',
      url: generateEntityArtwork('#eab308', 'spire'),
      kind: 'scene',
      created_at: now,
    },
    {
      id: 'asset-sunken-reliquary',
      slug: 'sunken-reliquary-ruins',
      name: 'The Sunken Reliquary',
      url: generateEntityArtwork('#38bdf8', 'reliquary'),
      kind: 'scene',
      created_at: now,
    },
    {
      id: 'asset-vaelora-portrait',
      slug: 'lady-vaelora-portrait',
      name: 'Lady Vaelora Portrait',
      url: generateEntityArtwork('#d4a853', 'character'),
      kind: 'portrait',
      created_at: now,
    },
    {
      id: 'asset-shadow-guild-crest',
      slug: 'shadow-guild-crest',
      name: 'Shadow Guild Crest',
      url: generateEntityArtwork('#a855f7', 'guild'),
      kind: 'handout',
      created_at: now,
    },
  ];
}

export function buildSeedDataset(): {
  world: World;
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  initialTabs: TabItem[];
  activeTabId: string;
} {
  const seedWorldSize = DEFAULT_NEW_WORLD_SIZE;
  const terrain = generateShatteredReachTerrain(
    heightResForWorldSize(seedWorldSize),
    seedWorldSize
  );
  const yAt = (x: number, z: number) =>
    sampleTerrainElevation(
      terrain.heightData,
      terrain.resolution,
      x,
      z,
      seedWorldSize,
      DEFAULT_DISPLACEMENT
    );

  const world: World = {
    id: DEMO_WORLD_ID,
    owner_id: null,
    name: 'Aethelgard (West Marches)',
    description: 'West Marches dark-fantasy campaign across the shattered coastline of Aethelgard.',
    mode: 'west_marches',
    max_players_per_party: 5,
    calendar_config: DEFAULT_CALENDAR_CONFIG,
  };

  const now = new Date().toISOString();

  const entities: Entity[] = [
    {
      id: 'ent-oakhaven',
      world_id: DEMO_WORLD_ID,
      slug: 'oakhaven',
      title: 'Oakhaven',
      type: 'Location',
      category: 'encyclopedia',
      tags: ['free-port', 'harbor', 'west-marches', 'hub'],
      summary:
        'Free Port • Controlled by The Shadow Guild. A timber-and-basalt trade haven clinging to the western bay, lit by whale-oil beacons.',
      content: `# Oakhaven

**Oakhaven** is the largest free port on the western rim of [[Shattered Reach — West Marches]], built over submerged basalt piers where river barges meet storm-rigged caravels.

## Governance & Factions
Officially governed by the Harbor Magistracy under Harbor-Master [[Kaelen Voss]], real authority rests in the lantern-lit cellars of [[The Shadow Guild]] and their silent patron, [[Lady Vaelora]].

## Key Landmarks
- **The Salt-Iron Docks:** Berth for smugglers running relics recovered from [[The Sunken Reliquary]].
- **The Gilded Astrolabe Tavern:** Gathering hall for West Marches expeditions bound north along the Ash-Road toward [[Ashen Spire]].
- **The Old Lighthouse:** Emits a pale amber beam across [[The Glass Shoals]] during eclipse tides.`,
      gm_secrets:
        'Three Magistracy dock-wardens are on [[The Shadow Guild]] payroll. Beneath the Old Lighthouse sits a sealed sea-gate leading directly into an outer vault of [[The Sunken Reliquary]], guarded by a blind clockwork warden.',
      cover_image_url: generateEntityArtwork('#d4a853', 'harbor'),
      metadata: {
        Population: '14,200',
        Ruler: 'Harbor-Master Kaelen Voss (Nominal)',
        'Faction Control': 'The Shadow Guild',
        'Danger Level': 'Moderate (Urban Intrigue)',
        Weather: 'Salt Fog & Coastal Squalls',
      },
      is_favorite: true,
      updated_at: now,
    },
    {
      id: 'ent-ashen-spire',
      world_id: DEMO_WORLD_ID,
      slug: 'ashen-spire',
      title: 'Ashen Spire',
      type: 'Location',
      category: 'encyclopedia',
      tags: ['citadel', 'mountains', 'cinder-crown', 'outpost'],
      summary:
        'High-Altitude Obsidian Citadel • Guarded by the Cinder Watch. An ancient obsidian watchtower crowning the snowbound ridge above the Reach.',
      content: `# Ashen Spire

Perched atop a knife-edge ridge of the [[Cinder Crown Peaks]], **Ashen Spire** commands an unbroken sightline across the northern valleys and down to [[Oakhaven]].

## Architecture & Lore
Carved from fused volcanic glass during the [[First Age of Cinders]], the citadel warms itself through deep geothermal vents. Its brazier crown burns with pale gold fire whenever astral conjunctions near.

## Expedition Notes
Travelers following the High Trail from [[Oakhaven]] must cross the frozen gorge before dusk. Rumors in [[Session 14: Whispers Beneath the Shoals]] claim [[Lady Vaelora]] recently dispatched an envoy carrying the [[Obsidian Astrolabe]] to the Spire's upper observatory.`,
      gm_secrets:
        'The geothermal heart beneath Ashen Spire is actually a slumbering primordial furnace. Ringing the seventh obsidian bell awakens the magma conduits—and alerts the red wyrmling nested in the eastern caldera.',
      cover_image_url: generateEntityArtwork('#eab308', 'spire'),
      metadata: {
        Elevation: '3,840 m',
        Garrison: '42 Cinder Watch Rangers',
        'Danger Level': 'High (Alpine & Arcane)',
        Weather: 'Freezing Ash-Wind',
      },
      is_favorite: true,
      updated_at: now,
    },
    {
      id: 'ent-sunken-reliquary',
      world_id: DEMO_WORLD_ID,
      slug: 'the-sunken-reliquary',
      title: 'The Sunken Reliquary',
      type: 'Location',
      category: 'encyclopedia',
      tags: ['ruins', 'dungeon', 'elder-gods', 'shoals'],
      summary:
        'Sunken Temple of the Elder Gods • Half-submerged beneath The Glass Shoals. Exposed only when the twin-moon low tide recedes.',
      content: `# The Sunken Reliquary

Half-drowned amid the razor reefs of [[The Glass Shoals]], **The Sunken Reliquary** is a monumental temple complex dedicated to [[Vaelor, The Drowned Star]].

## Hazards & Expeditions
At high tide, only the jagged basalt pediment and bronze lantern-pylons breach the foam. Salvage crews from [[Oakhaven]] employ diving bells forged by [[Tide-Bound Kin]] artisans, though few survive encounters with the [[Mire-Leviathan]].

## Recent Discoveries
During [[Session 14: Whispers Beneath the Shoals]], scouts mapped the Choir Nave and identified inscriptions matching those inside [[Ashen Spire]].`,
      gm_secrets:
        'The central altar is an inverted planar anchor holding back a rift to the Brine-Abyss. Removing the Star-Chalice triggers a 4-round flooding countdown and awakens two Drowned Choir Acolytes.',
      cover_image_url: generateEntityArtwork('#38bdf8', 'reliquary'),
      metadata: {
        Depth: '18 m at High Tide',
        Patron: 'Vaelor, The Drowned Star',
        'Danger Level': 'Deadly (Tier 3)',
        Weather: 'Riptides & Bioluminescent Mist',
      },
      is_favorite: true,
      updated_at: now,
    },
    {
      id: 'ent-lady-vaelora',
      world_id: DEMO_WORLD_ID,
      slug: 'lady-vaelora',
      title: 'Lady Vaelora',
      type: 'Character',
      category: 'encyclopedia',
      tags: ['noble', 'spymaster', 'patron', 'shadow-guild'],
      summary:
        'Whisper-Archon of The Shadow Guild & Patron of Expeditions. An enigmatic silver-masked aristocrat pulling strings across Oakhaven.',
      content: `# Lady Vaelora

Known throughout [[Oakhaven]] as the Velvet Arbiter, **Lady Vaelora** finances half the West Marches charters while secretly directing [[The Shadow Guild]].

## Appearance & Demeanor
Tall, dressed in charcoal silk threaded with tarnished gold, she rarely removes her filigree half-mask. She speaks fluent [[Low Thalassian]] and negotiates exclusively in favors and sealed writs.

## Connections
- Employs [[Kaelen Voss]] as her reluctant public voice on the Harbor Council.
- Seeks the lost meridian plates inside [[The Sunken Reliquary]] and the [[Obsidian Astrolabe]] held at [[Ashen Spire]].`,
      gm_secrets:
        'Lady Vaelora is actually an immortal scion of the First Thalassian Dynasty. Her mask conceals creeping abyssal barnacle-scars—she needs the Reliquary altar to break a century-old blood curse.',
      cover_image_url: generateEntityArtwork('#d4a853', 'character'),
      metadata: {
        Title: 'Whisper-Archon',
        Allegiance: 'The Shadow Guild',
        Disposition: 'Calculated Neutral',
        Status: 'Active in Oakhaven',
      },
      is_favorite: true,
      updated_at: now,
    },
    {
      id: 'ent-kaelen-voss',
      world_id: DEMO_WORLD_ID,
      slug: 'kaelen-voss',
      title: 'Kaelen Voss',
      type: 'Character',
      category: 'encyclopedia',
      tags: ['npc', 'harbor-master', 'oakhaven'],
      summary:
        'Harbor-Master of Oakhaven. Pragmatic former privateer trying to keep the free port from tearing itself apart.',
      content: `# Kaelen Voss

Once captain of the iron-hulled brig *Duskrunner*, **Kaelen Voss** now presides over customs, dock tariffs, and patrol cutters in [[Oakhaven]].

## Role in the Campaign
Kaelen hires independent bands from [[Shattered Reach — West Marches]] to clear reef hazards near [[The Sunken Reliquary]] and escort supply caravans up to [[Ashen Spire]]. He chafes under the quiet extortion of [[Lady Vaelora]].`,
      gm_secrets:
        'Kaelen still hides his old privateer logbook inside a false wall in the Harbor Customs House; it proves he sank a royal tax galleon ten years ago—leverage [[The Shadow Guild]] uses to keep him compliant.',
      cover_image_url: generateEntityArtwork('#94a3b8', 'character'),
      metadata: {
        Role: 'Harbor-Master',
        Location: 'Oakhaven',
        Alignment: 'Lawful Pragmatic',
      },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-shadow-guild',
      world_id: DEMO_WORLD_ID,
      slug: 'the-shadow-guild',
      title: 'The Shadow Guild',
      type: 'Faction',
      category: 'encyclopedia',
      tags: ['syndicate', 'smugglers', 'espionage'],
      summary:
        'Clandestine maritime syndicate controlling Oakhaven smuggling lanes, cipher-couriers, and relic auctions.',
      content: `# The Shadow Guild

Operating beneath the docks of [[Oakhaven]], **The Shadow Guild** is a disciplined network of information brokers, reef-pilots, and relic fences.

## Structure
- **The Whisper-Archon:** [[Lady Vaelora]], supreme strategist.
- **Harbor Eyes:** Informants embedded across [[Shattered Reach — West Marches]] taverns.
- **Ash-Runners:** Smugglers braving the mountain passes to [[Ashen Spire]].`,
      gm_secrets:
        'A splinter cell led by Quartermaster Varn plans to assassinate [[Lady Vaelora]] during the upcoming Solstice Tide and sell the Guild cipher-ledger to foreign corsairs.',
      cover_image_url: generateEntityArtwork('#a855f7', 'guild'),
      metadata: {
        Headquarters: 'Oakhaven Undercroft',
        Influence: 'Dominant (Maritime)',
        Leader: 'Lady Vaelora',
      },
      is_favorite: true,
      updated_at: now,
    },
    {
      id: 'ent-session-14',
      world_id: DEMO_WORLD_ID,
      slug: 'session-14-whispers',
      title: 'Session 14: Whispers Beneath the Shoals',
      type: 'Session',
      category: 'campaign',
      tags: ['session-log', 'arc-2', 'reliquary'],
      summary:
        'The party charted the low-tide causeway into The Sunken Reliquary and intercepted a Shadow Guild courier.',
      content: `# Session 14: Whispers Beneath the Shoals

*Played 12th of Frostfall — West Marches Party: Lyra, Thorne, Bram, and Vesper.*

## Session Recap
1. Departed [[Oakhaven]] before dawn aboard a hired skiff chartered through [[Kaelen Voss]].
2. Navigated the obsidian reefs of [[The Glass Shoals]] while evading a distant [[Mire-Leviathan]] wake.
3. Reached the outer peristyle of [[The Sunken Reliquary]], discovering drowned reliefs depicting [[Ashen Spire]] and the [[Obsidian Astrolabe]].
4. Captured a cipher scroll stamped with the sigil of [[The Shadow Guild]] and addressed to [[Lady Vaelora]].

## Next Hooks
- Decode the [[Low Thalassian]] ledger before the next full moon.
- Decide whether to confront [[Lady Vaelora]] or strike north toward [[Ashen Spire]].`,
      gm_secrets:
        'If the party returns the cipher scroll unopened to [[Lady Vaelora]], she rewards them with 800 gp and a Writ of Safe Harbor. If they leak it to [[Kaelen Voss]], the Guild triggers an ambush at the Salt-Iron Docks.',
      cover_image_url: generateEntityArtwork('#d4a853', 'scroll'),
      metadata: {
        Session: 14,
        Date: '12 Frostfall',
        PartyLevel: 6,
      },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-campaign-overview',
      world_id: DEMO_WORLD_ID,
      slug: 'shattered-reach-west-marches',
      title: 'Shattered Reach — West Marches',
      type: 'Campaign',
      category: 'campaign',
      tags: ['west-marches', 'campaign-hub', 'sandbox'],
      summary:
        'Active West Marches sandbox campaign centered on Oakhaven, alpine ruins, and the drowned temples of the Shoals.',
      content: `# Shattered Reach — West Marches

Welcome to the living campaign chronicle of **The Shattered Reach**. Players launch expeditions from the safe harbor of [[Oakhaven]] into the untamed frontier.

## Active Story Arcs
- **Crown of Cinders:** Strange beacon fires flaring atop [[Ashen Spire]] in the [[Cinder Crown Peaks]].
- **Tides of the Elder Deep:** Cult activity stirring inside [[The Sunken Reliquary]].
- **Velvet & Iron:** The cold war between [[Kaelen Voss]] and [[Lady Vaelora]] of [[The Shadow Guild]].

## Latest Chronicles
- [[Session 14: Whispers Beneath the Shoals]]`,
      gm_secrets:
        'Campaign Endgame Clock: When 3 planar seals are broken across the Reach, the sunken island rises fully and transforms the coastal map.',
      cover_image_url: generateEntityArtwork('#eab308', 'scroll'),
      metadata: {
        System: '5e / Dark Fantasy Grimoire',
        Players: '6 Rotating',
        Status: 'Active (Arc II)',
      },
      is_favorite: true,
      updated_at: now,
    },
    {
      id: 'ent-obsidian-astrolabe',
      world_id: DEMO_WORLD_ID,
      slug: 'obsidian-astrolabe',
      title: 'Obsidian Astrolabe',
      type: 'Item',
      category: 'encyclopedia',
      tags: ['artifact', 'astral', 'quest-item'],
      summary:
        'Celestial brass-and-volcanic-glass instrument capable of aligning sea-tides with hidden shrines.',
      content: `# Obsidian Astrolabe

An intricate relic forged during the [[First Age of Cinders]]. When held at [[Ashen Spire]], its rings align with submerged vaults in [[The Sunken Reliquary]].`,
      gm_secrets: 'Attuning to the Astrolabe grants truesight in fog but slowly turns the bearer’s veins obsidian-black.',
      cover_image_url: generateEntityArtwork('#eab308', 'scroll'),
      metadata: { Rarity: 'Artifact', Attunement: 'Required' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-mire-leviathan',
      world_id: DEMO_WORLD_ID,
      slug: 'mire-leviathan',
      title: 'Mire-Leviathan',
      type: 'Bestiary',
      category: 'encyclopedia',
      tags: ['monstrosity', 'aquatic', 'cr-11'],
      summary:
        'Armored abyssal eel-wyrm patrolling the deep trenches of The Glass Shoals.',
      content: `# Mire-Leviathan

Sailors out of [[Oakhaven]] whisper of bioluminescent spines gliding beneath hulls near [[The Sunken Reliquary]].`,
      gm_secrets: 'Vulnerable to lightning damage when its dorsal plates open to emit a sonic stun.',
      cover_image_url: generateEntityArtwork('#38bdf8', 'reliquary'),
      metadata: { CR: '11', Habitat: 'The Glass Shoals' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-vaelor-deity',
      world_id: DEMO_WORLD_ID,
      slug: 'vaelor-drowned-star',
      title: 'Vaelor, The Drowned Star',
      type: 'Deity',
      category: 'encyclopedia',
      tags: ['elder-god', 'tempest', 'abyss'],
      summary:
        'Forgotten celestial leviathan worshipped in submerged basilicas across the southern coast.',
      content: `# Vaelor, The Drowned Star

Ancient hymns carved into [[The Sunken Reliquary]] invoke **Vaelor** as keeper of sunken oaths and eclipses.`,
      gm_secrets: 'Vaelor is neither dead nor asleep—its eye is the cold blue star visible only from Ashen Spire.',
      cover_image_url: generateEntityArtwork('#38bdf8', 'guild'),
      metadata: { Domain: 'Tempest, Secrets', Alignment: 'Alien Neutral' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-treaty-emberfall',
      world_id: DEMO_WORLD_ID,
      slug: 'treaty-of-emberfall',
      title: 'Treaty of Emberfall',
      type: 'Event',
      category: 'encyclopedia',
      tags: ['history', 'treaty', 'oakhaven'],
      summary:
        'Charter granting Oakhaven independent port sovereignty after the Cinder Wars.',
      content: `# Treaty of Emberfall

Signed fifty winters ago inside the Old Customs Hall of [[Oakhaven]], establishing free-port neutrality.`,
      gm_secrets: 'A hidden codicil grants the bearer of the [[Lady Vaelora|Silver Signet]] emergency naval command.',
      cover_image_url: generateEntityArtwork('#d4a853', 'scroll'),
      metadata: { Year: '412 AC', Signatories: 'Cinder Watch & Free Captains' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-first-age',
      world_id: DEMO_WORLD_ID,
      slug: 'first-age-of-cinders',
      title: 'First Age of Cinders',
      type: 'History',
      category: 'world',
      tags: ['era', 'ancient', 'cinders'],
      summary:
        'Mythic volcanic epoch that raised the Cinder Crown Peaks and forged Ashen Spire.',
      content: `# First Age of Cinders

An era of sky-piercing basalt citadels such as [[Ashen Spire]] and arcane astrolabes before the Great Subsidence flooded [[The Glass Shoals]].`,
      gm_secrets: 'The Subsidence was deliberately triggered by Thalassian archmages to drown a rebellious titan.',
      cover_image_url: generateEntityArtwork('#f97316', 'spire'),
      metadata: { Span: '0 – 1,200 AC' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-cinder-peaks',
      world_id: DEMO_WORLD_ID,
      slug: 'cinder-crown-peaks',
      title: 'Cinder Crown Peaks',
      type: 'Region',
      category: 'world',
      tags: ['mountains', 'region', 'north'],
      summary:
        'Jagged alpine barrier crowning the northern horizon of The Shattered Reach.',
      content: `# Cinder Crown Peaks

Home to geothermal vents, glacial passes, and the fortress of [[Ashen Spire]].`,
      gm_secrets: 'Three hidden dwarven frost-vaults lie sealed beneath the western glacier.',
      cover_image_url: generateEntityArtwork('#94a3b8', 'spire'),
      metadata: { Climate: 'Sub-Arctic Alpine', HighestPeak: '4,920 m' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-glass-shoals',
      world_id: DEMO_WORLD_ID,
      slug: 'the-glass-shoals',
      title: 'The Glass Shoals',
      type: 'Region',
      category: 'world',
      tags: ['sea', 'archipelago', 'reefs'],
      summary:
        'Treacherous turquoise-and-obsidian reef sea surrounding The Sunken Reliquary.',
      content: `# The Glass Shoals

Named for razor-sharp volcanic glass spires jutting from the tide around [[The Sunken Reliquary]]. Only [[Tide-Bound Kin]] pilots know every channel.`,
      gm_secrets: 'During blood moons, sunken bell-towers chime underwater, luring sailors toward the [[Mire-Leviathan]].',
      cover_image_url: generateEntityArtwork('#38bdf8', 'reliquary'),
      metadata: { Waters: 'Tidal Reefs', Hazards: 'Razor Basalt & Leviathans' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-tide-kin',
      world_id: DEMO_WORLD_ID,
      slug: 'tide-bound-kin',
      title: 'Tide-Bound Kin',
      type: 'Culture',
      category: 'world',
      tags: ['culture', 'mariners', 'shoals'],
      summary:
        'Salt-hardened reef navigators and bronze-bell divers inhabiting coastal stilt-villages.',
      content: `# Tide-Bound Kin

Masters of [[The Glass Shoals]] who trade salvage and reef charts in [[Oakhaven]].`,
      gm_secrets: 'Their elders still preserve spoken prayers in [[Low Thalassian]] to appease [[Vaelor, The Drowned Star]].',
      cover_image_url: generateEntityArtwork('#38bdf8', 'harbor'),
      metadata: { Language: 'Low Thalassian' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-low-thalassian',
      world_id: DEMO_WORLD_ID,
      slug: 'low-thalassian',
      title: 'Low Thalassian',
      type: 'Language',
      category: 'world',
      tags: ['language', 'script', 'ancient'],
      summary:
        'Coastal liturgical and mercantile tongue spoken by sailors and inscribed on ancient vaults.',
      content: `# Low Thalassian

Derived from the fallen Thalassian Empire, still read by scholars like [[Lady Vaelora]] and engraved throughout [[The Sunken Reliquary]].`,
      gm_secrets: 'Speaking its High Imperative dialect activates ward-glyphs inside the Reliquary.',
      cover_image_url: generateEntityArtwork('#d4a853', 'scroll'),
      metadata: { Script: 'Tidal Runes' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-aether-weaving',
      world_id: DEMO_WORLD_ID,
      slug: 'aether-weaving',
      title: 'Aether-Weaving',
      type: 'Magic',
      category: 'world',
      tags: ['magic', 'ley-lines', 'arcana'],
      summary:
        'Arcane discipline channeling geothermal and tidal ley-lines between Spire and Shoal.',
      content: `# Aether-Weaving

Practiced atop [[Ashen Spire]] using focused prisms like the [[Obsidian Astrolabe]].`,
      gm_secrets: 'Over-channeling near [[The Sunken Reliquary]] causes wild surges.',
      cover_image_url: generateEntityArtwork('#a855f7', 'spire'),
      metadata: { Focus: 'Obsidian Prisms' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-kronika',
      world_id: DEMO_WORLD_ID,
      slug: 'chronicle-of-the-reach',
      title: 'Chronicle of the Reach',
      type: 'Chronicle',
      category: 'encyclopedia',
      tags: ['timeline', 'lore'],
      summary:
        'Year-by-year ledger of storms, treaties, and expeditions across Aethelgard.',
      content: `# Chronicle of the Reach

- **Year 0 AC:** [[First Age of Cinders]] dawns; [[Ashen Spire]] raised.
- **Year 412 AC:** [[Treaty of Emberfall]] establishes [[Oakhaven]].
- **Year 462 AC:** Current West Marches expeditions begin.`,
      gm_secrets: 'Every 500 years the Drowned Star reaches nadir, triggering the Great Spring Tide.',
      cover_image_url: generateEntityArtwork('#d4a853', 'scroll'),
      metadata: { CurrentYear: '462 AC' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-plot-cinder-beacon',
      world_id: DEMO_WORLD_ID,
      slug: 'plot-cinder-beacon',
      title: 'The Lit Beacon of Ashen Spire',
      type: 'PlotThread',
      category: 'campaign',
      tags: ['plot', 'mystery'],
      summary:
        'Why did the long-dormant astral brazier atop Ashen Spire ignite three nights ago?',
      content: `# The Lit Beacon of Ashen Spire

Witnesses in [[Oakhaven]] saw golden fire flare above [[Ashen Spire]] during the eclipse.`,
      gm_secrets: 'An agent of [[Lady Vaelora]] bypassed the lower wards using a stolen Cinder Watch key.',
      cover_image_url: generateEntityArtwork('#eab308', 'spire'),
      metadata: { Urgency: 'High' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-quest-diving-bell',
      world_id: DEMO_WORLD_ID,
      slug: 'quest-sunken-bell',
      title: 'Recover the Astrolabe Shard',
      type: 'Quest',
      category: 'campaign',
      tags: ['quest', 'bounty'],
      summary:
        'Retrieve the missing bronze astrolabe meridian from the drowned nave of The Sunken Reliquary.',
      content: `# Recover the Astrolabe Shard

Posted by [[Kaelen Voss]] (and quietly matched by [[Lady Vaelora]]). Reward: 650 gp + safe berth in [[Oakhaven]].`,
      gm_secrets: 'Returning it to Voss destabilizes Shadow Guild control in the harbor.',
      cover_image_url: generateEntityArtwork('#d4a853', 'scroll'),
      metadata: { Reward: '650 gp', Tier: '2' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-player-notes',
      world_id: DEMO_WORLD_ID,
      slug: 'party-supply-ledger',
      title: 'Party Supply & Rumor Ledger',
      type: 'PlayerNote',
      category: 'campaign',
      tags: ['party', 'inventory', 'rumors'],
      summary:
        'Shared party notes tracking rations, skiff charter fees, and tavern rumors in Oakhaven.',
      content: `# Party Supply & Rumor Ledger

- Skiff *Sea-Wren* moored at Pier 4 in [[Oakhaven]].
- Rumor: Silver-masked noble seen speaking with [[Kaelen Voss]] near midnight.
- Next destination: [[The Sunken Reliquary]] low-tide window.`,
      gm_secrets: '',
      cover_image_url: generateEntityArtwork('#94a3b8', 'scroll'),
      metadata: { Gold: '340 gp', Rations: '14 days' },
      is_favorite: false,
      updated_at: now,
    },
    {
      id: 'ent-shadow-network',
      world_id: DEMO_WORLD_ID,
      slug: 'harbor-magistracy',
      title: 'Oakhaven Harbor Magistracy',
      type: 'Organization',
      category: 'encyclopedia',
      tags: ['civic', 'trade', 'oakhaven'],
      summary:
        'Civic council overseeing port tariffs, lighthouse maintenance, and harbor defense.',
      content: `# Oakhaven Harbor Magistracy

Chaired by [[Kaelen Voss]] under the [[Treaty of Emberfall]].`,
      gm_secrets: 'Two of the five magistrates report directly to [[Lady Vaelora]].',
      cover_image_url: generateEntityArtwork('#d4a853', 'harbor'),
      metadata: { Seat: 'Customs House, Oakhaven' },
      is_favorite: false,
      updated_at: now,
    },
  ];

  const toPts = (coords: Array<[number, number]>) =>
    coords.map(([x, z]) => ({ x, y: yAt(x, z), z }));

  const seededZones: WorldMapZone[] = [
    {
      id: 'zone-oakhaven-freeholds',
      layerId: 'layer-countries',
      name: 'Oakhaven Freeholds',
      points: toPts([
        [-38, -12],
        [-8, -10],
        [-3, 8],
        [-16, 18],
        [-36, 12],
      ]),
      color: '#d4a853',
      borderStyle: 'double',
      borderWidth: 2.8,
      showLabel: true,
      labelScale: 1.0,
      entityId: 'ent-oakhaven',
      is_gm_only: false,
    },
    {
      id: 'zone-cinder-marches',
      layerId: 'layer-countries',
      name: 'Cinder Crown Marches',
      points: toPts([
        [-4, -36],
        [36, -36],
        [38, -6],
        [10, -4],
        [-4, -14],
      ]),
      color: '#e07a5f',
      borderStyle: 'double',
      borderWidth: 2.8,
      showLabel: true,
      labelScale: 1.0,
      entityId: 'ent-ashen-spire',
      is_gm_only: false,
    },
    {
      id: 'zone-glass-shoals',
      layerId: 'layer-regions',
      name: 'The Glass Shoals',
      points: toPts([
        [-32, 14],
        [24, 12],
        [28, 36],
        [-30, 36],
      ]),
      color: '#38bdf8',
      borderStyle: 'dashed',
      borderWidth: 2.0,
      showLabel: false,
      labelScale: 0.95,
      entityId: 'ent-sunken-reliquary',
      is_gm_only: false,
    },
    {
      id: 'zone-drowned-star-faith',
      layerId: 'layer-religions',
      name: 'Covenant of the Drowned Star',
      points: toPts([
        [-28, 4],
        [22, 6],
        [26, 34],
        [-24, 32],
      ]),
      color: '#c084fc',
      borderStyle: 'dashed',
      borderWidth: 2.2,
      showLabel: true,
      labelScale: 0.9,
      is_gm_only: false,
    },
    {
      id: 'zone-ember-vigil-faith',
      layerId: 'layer-religions',
      name: 'Order of the Ember Vigil',
      points: toPts([
        [-10, -34],
        [34, -34],
        [34, 2],
        [-6, -2],
      ]),
      color: '#f59e0b',
      borderStyle: 'dashed',
      borderWidth: 2.2,
      showLabel: true,
      labelScale: 0.9,
      is_gm_only: false,
    },
  ];

  const seededLabels: WorldMapLabel[] = [
    {
      id: 'lbl-shattered-reach',
      text: 'THE SHATTERED REACH',
      x: -6,
      y: yAt(-6, -4),
      z: -4,
      yOffset: 1.8,
      fontSize: 2.5,
      color: '#e9dec7',
      rotationY: -0.14,
      style: 'title',
      layerId: null,
      opacity: 0.65,
      is_gm_only: false,
    },
    {
      id: 'lbl-glass-shoals',
      text: 'THE GLASS SHOALS',
      x: -22,
      y: Math.max(0.23 * DEFAULT_DISPLACEMENT, yAt(-22, 22)),
      z: 22,
      yOffset: 0.65,
      fontSize: 1.75,
      color: '#93c5d4',
      rotationY: -0.08,
      style: 'sea',
      layerId: null,
      opacity: 0.62,
      is_gm_only: false,
    },
    {
      id: 'lbl-cinder-crown',
      text: 'CINDER CROWN PEAKS',
      x: 24,
      y: yAt(24, -24),
      z: -24,
      yOffset: 1.5,
      fontSize: 1.6,
      color: '#cbd5e1',
      rotationY: 0.08,
      style: 'region',
      layerId: null,
      opacity: 0.55,
      is_gm_only: false,
    },
  ];

  const maps: VaultMap[] = [
    {
      id: DEMO_MAP_ID,
      world_id: DEMO_WORLD_ID,
      name: 'World Map: Shattered Reach',
      albedo_url: terrain.albedoDataUrl,
      heightmap_url: terrain.heightmapDataUrl,
      width: 8192,
      height: 8192,
      displacement_scale: DEFAULT_DISPLACEMENT,
      world_size: seedWorldSize,
      scale_config: {
        ratio: '1 : 250 000',
        elevationSource: 'Heightmap (32-bit)',
        kmPerUnit: 1.6,
      },
      layers: createDefaultWorldLayers(),
      zones: seededZones,
      labels: seededLabels,
      fog_volumes: [
        {
          id: 'seed-fog-oakhaven-bay',
          name: 'Oakhaven Harbor Mist',
          shape: 'cylinder',
          x: -20,
          y: 2.8,
          z: 8,
          width: 24,
          depth: 20,
          height: 5.5,
          rotY: 0.25,
          color: '#bcd0dc',
          density: 0.72,
          edgeSoftness: 0.68,
          heightFalloff: 0.75,
          noiseScale: 0.9,
          noiseStrength: 0.6,
          windSpeed: 0.55,
          windDirection: 28,
          glow: 0.05,
          lightScattering: 0.7,
          visible: true,
          is_gm_only: false,
        },
        {
          id: 'seed-fog-sunken-reliquary',
          name: 'Drowned Choir Sea Fog',
          shape: 'sphere',
          x: 11,
          y: 2.6,
          z: 22,
          width: 22,
          depth: 22,
          height: 6.5,
          rotY: 0,
          color: '#7ab8c8',
          density: 0.85,
          edgeSoftness: 0.72,
          heightFalloff: 0.6,
          noiseScale: 1.15,
          noiseStrength: 0.68,
          windSpeed: 0.45,
          windDirection: -35,
          glow: 0.25,
          lightScattering: 0.65,
          visible: true,
          is_gm_only: false,
        },
        {
          id: 'seed-fog-cinder-pass',
          name: 'Cinder Crown Valley Shroud',
          shape: 'box',
          x: 4,
          y: 5.2,
          z: -14,
          width: 28,
          depth: 18,
          height: 7,
          rotY: -0.2,
          color: '#cfd8e3',
          density: 0.68,
          edgeSoftness: 0.65,
          heightFalloff: 0.8,
          noiseScale: 0.85,
          noiseStrength: 0.55,
          windSpeed: 0.38,
          windDirection: 15,
          glow: 0,
          lightScattering: 0.6,
          visible: true,
          is_gm_only: false,
        },
      ],
      props: [
        { id: 'seed-prop-village-oakhaven', kind: 'village', name: 'Oakhaven Town', x: -16.8, y: yAt(-16.8, 3.2), z: 3.2, rotY: 0.4, scale: 1.2 },
        { id: 'seed-prop-pier-oakhaven', kind: 'pier', name: 'Salt-Iron Docks', x: -18.5, y: yAt(-18.5, 6.2), z: 6.2, rotY: 0.55, scale: 1.2 },
        { id: 'seed-prop-ship-bay', kind: 'ship', name: 'Caravel Duskrunner', x: -22.5, y: 0.23 * DEFAULT_DISPLACEMENT, z: 10.5, rotY: -0.6, scale: 1.15 },
        { id: 'seed-prop-castle-spire', kind: 'castle', name: 'Ashen Spire Citadel', x: 18.2, y: yAt(18.2, -16.5), z: -16.5, rotY: -0.3, scale: 1.15 },
        { id: 'seed-prop-temple-reliquary', kind: 'temple', name: 'Drowned Choir Temple', x: 11.2, y: yAt(11.2, 21.8), z: 21.8, rotY: 0.2, scale: 1.1 },
      ],
    },
  ];

  const mapPins: MapPin[] = [
    {
      id: 'pin-oakhaven',
      map_id: DEMO_MAP_ID,
      entity_id: 'ent-oakhaven',
      label: 'Oakhaven',
      x: -16,
      y: yAt(-16, 4),
      z: 4,
      icon_type: 'port',
      is_gm_only: false,
    },
    {
      id: 'pin-ashen-spire',
      map_id: DEMO_MAP_ID,
      entity_id: 'ent-ashen-spire',
      label: 'Ashen Spire',
      x: 18,
      y: yAt(18, -17),
      z: -17,
      icon_type: 'citadel',
      is_gm_only: false,
    },
    {
      id: 'pin-sunken-reliquary',
      map_id: DEMO_MAP_ID,
      entity_id: 'ent-sunken-reliquary',
      label: 'The Sunken Reliquary',
      x: 11,
      y: yAt(11, 22),
      z: 22,
      icon_type: 'ruin',
      is_gm_only: false,
    },
    {
      id: 'pin-smuggler-cache',
      map_id: DEMO_MAP_ID,
      entity_id: 'ent-shadow-guild',
      label: 'Shadow Guild Sea-Gate (GM)',
      x: -14,
      y: yAt(-14, 16),
      z: 16,
      icon_type: 'danger',
      is_gm_only: true,
    },
  ];

  // Terrain-hugging routes matching the golden dashed trails in the screenshot
  const ashRoadPts: Array<[number, number]> = [
    [-16, 4],
    [-8, 1],
    [-1, -2],
    [6, -6],
    [12, -11],
    [18, -17],
  ];

  const seaLanePts: Array<[number, number]> = [
    [-16, 4],
    [-8, 9],
    [0, 14],
    [6, 18],
    [11, 22],
  ];

  const regionCinderPts: Array<[number, number]> = [
    [4, -28],
    [32, -28],
    [34, -8],
    [10, -8],
  ];

  const mapPaths: MapPath[] = [
    {
      id: 'path-ash-road',
      map_id: DEMO_MAP_ID,
      name: 'The High Ash-Road (Oakhaven → Ashen Spire)',
      points: ashRoadPts.map(([x, z]) => ({ x, y: yAt(x, z), z })),
      style: 'dashed-gold',
      is_gm_only: false,
    },
    {
      id: 'path-shoal-lane',
      map_id: DEMO_MAP_ID,
      name: 'Low-Tide Causeway (Oakhaven → Sunken Reliquary)',
      points: seaLanePts.map(([x, z]) => ({ x, y: yAt(x, z), z })),
      style: 'dashed-gold',
      is_gm_only: false,
    },
    {
      id: 'region-cinder-watch',
      map_id: DEMO_MAP_ID,
      name: 'Cinder Watch Patrol Jurisdiction',
      points: regionCinderPts.map(([x, z]) => ({ x, y: yAt(x, z), z })),
      style: 'region-polygon',
      is_gm_only: false,
    },
  ];

  const entityLinks = computeAllEntityLinks(entities);

  const initialTabs: TabItem[] = [
    {
      id: 'tab-campaign',
      kind: 'entity',
      targetId: 'ent-campaign-overview',
      title: 'Shattered Reach — West Marches',
      iconType: 'Campaign',
    },
    {
      id: 'tab-vaelora',
      kind: 'entity',
      targetId: 'ent-lady-vaelora',
      title: 'Lady Vaelora',
      iconType: 'Character',
    },
    {
      id: 'tab-map-main',
      kind: 'map',
      targetId: DEMO_MAP_ID,
      title: 'World Map: Shattered Reach',
      iconType: 'Map',
    },
    {
      id: 'tab-session-14',
      kind: 'entity',
      targetId: 'ent-session-14',
      title: 'Session 14: Whispers...',
      iconType: 'Session',
    },
    {
      id: 'tab-kaelen',
      kind: 'entity',
      targetId: 'ent-kaelen-voss',
      title: 'Kaelen Voss',
      iconType: 'Character',
    },
    {
      id: 'tab-oakhaven',
      kind: 'entity',
      targetId: 'ent-oakhaven',
      title: 'Oakhaven',
      iconType: 'Location',
    },
    {
      id: 'tab-shadow-guild',
      kind: 'entity',
      targetId: 'ent-shadow-guild',
      title: 'The Shadow Guild',
      iconType: 'Faction',
    },
  ];

  return {
    world,
    entities,
    entityLinks,
    maps,
    mapPins,
    mapPaths,
    assets: buildSeedAssets(),
    initialTabs,
    activeTabId: 'tab-map-main',
  };
}
