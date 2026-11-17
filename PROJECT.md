# Project: Aethelgard Vault (Web-Only Multi-Campaign, West Marches, Custom Character Sheets & Live VTT)

## Architecture

Aethelgard Vault is a web-only, multi-user TTRPG worldbuilding, campaign management, custom character sheet, and live Virtual Tabletop (VTT) application built with React 18, TypeScript, Vite, Tailwind CSS, Zustand, Three.js / React Three Fiber, TipTap, and Supabase (Auth, Postgres + RLS + RPCs, Realtime, Storage).

- **Authentication & Identity**: Supabase Auth (Email + Password, `persistSession: true`, `autoRefreshToken: true`) backed by `public.profiles` (auto-created on `auth.users` insert) and `public.campaign_members` (`gm`, `co_gm`, `player`). No `localStorage` vault fallback, no `x-vault-token` passphrase lock, no hardcoded Supabase credentials.
- **Campaign Modes**:
  - `normal`: Invite-only fixed-party campaigns; multiple characters allowed per player.
  - `west_marches`: Open-hub campaigns with `?invite=CODE` joining, **strictly 1 active character per player** (DB trigger + UI), and interactive **Guild Quest Boards** on 3D/2D maps with atomic player-cap signups (`signup_for_guild_quest`).
- **Workspace Shell**: `TopHeader` (campaign switcher, mode badge, role-gated GM toggle, Dice Drawer toggle, JSON Import/Export) + 44px `LeftSidebar` rail & drawer (Vault, Journals, Characters, Sheet Studio, Timeline, Assets, Templates, Profile/Campaign Hub) + `PanelGroup` split-pane `TabItem` router + collapsible `RightInspector` (with shared `inspectorWidth` safe-inset so viewport overlays never collide).
- **Custom Character Sheets**: Roll20-style 3-pane pure code editor (HTML + CSS + JSON formulas) rendered inside an isolated `<iframe sandbox="allow-scripts" srcDoc={...}>` with typed `window.postMessage` bridge, safe expression evaluator (`sheetEngine.ts`, zero `eval`), repeating sections, and clickable `[[roll]]` buttons wired to the Realtime Dice Roller.
- **Per-Player Fog of War & Sharing**: `256x256` grayscale offscreen masks (`fogOfWarMask.ts`) uploaded to `vault-assets` Supabase Storage, composited via `max(ownMask, ...sharedPeerMasks)` into a 3D GPU `THREE.DataTexture` for terrain/ocean shaders and a 2D persistent battlemap shroud layer, with granular player-to-player `map_fog_shares`.
- **State & Sync**: Modular Zustand slices in `src/store/slices/` + `src/lib/campaignSync.ts`, strict `isEffectiveGm` (`(myRole === 'gm' || myRole === 'co_gm') && gmMode`), cloud-synced `undo`/`redo`, and lazy starter campaign seeding.

---

## Feature Inventory

Every requirement from `ORIGINAL_REQUEST.md`, `implementation_plan.md`, and the 3 Survey Explorer reports is assigned to a milestone below (none unassigned).

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Schema: Auth, Profiles & Campaigns | Remove `private.vault_credentials`, `vault_probe`, `has_valid_vault_token()`, and `anon` grants; add `profiles` + `auth.users` trigger, extend `worlds` (`mode`, `invite_code`, `max_players_per_party`, `calendar_config`, `active_sheet_template_id`), add `campaign_members`, creator `gm` trigger, `SECURITY DEFINER` `is_campaign_member`/`is_campaign_gm`/`join_campaign_by_invite` | M1 | Plan §1, Survey 1 |
| F2 | Schema: Characters, Sheets & West Marches Trigger | Add `character_sheet_templates` and `characters` tables; `BEFORE INSERT OR UPDATE` trigger with lock enforcing 1 active character per `(campaign_id, user_id)` when `worlds.mode = 'west_marches'` while allowing multiple in `normal` | M1 | Plan §1, Survey 1 |
| F3 | Schema: Guild Quest Boards & Atomic Signups | Add `map_quest_boards`, `guild_quests`, `guild_quest_signups` tables + atomic `signup_for_guild_quest` (`FOR UPDATE` capacity check, character ownership check, auto `full`) and withdraw support | M1 | Plan §1, Survey 1 |
| F4 | Schema: Journals, Fog, Dice, Timeline & Maps Columns | Add `journal_pages`, `journal_page_shares`, `map_fog_states`, `map_fog_shares`, `dice_rolls`, `timeline_events`; add dedicated `maps` columns (`world_size`, `sea_level`, `paint_url`, `water`, `terrain_shading`, `fog_volumes`, `fog_of_war_2d`, `combat_state`); Realtime publication + authenticated `vault-assets` Storage policies | M1 | Plan §1, Survey 1 |
| F5 | Tooling: Vitest, ESLint & CI Workflows | Add `vitest`, `jsdom`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` to `package.json`; install `node_modules`; add `vitest.config.ts`, `eslint.config.js`, `npm test`; update `.github/workflows/deploy.yml` (drop `VITE_GM_EMAIL`, run `lint`+`test`+`build`) & add `ci.yml` | M1 | Plan §9, Survey 3 |
| F6 | Web-Only Supabase Client & Storage Gateway | Remove `DEFAULT_SUPABASE_URL`, `DEFAULT_SUPABASE_PUBLISHABLE_KEY`, `x-vault-token`, `vault_probe` helpers; enable `persistSession: true`, `autoRefreshToken: true`; implement `uploadAssetDataUrlOrBlob` for `vault-assets` | M2 | Plan §2, Survey 1 |
| F7 | AuthScreen & Invite Link Flow | Replace `VaultLockScreen.tsx` & `AuthModal.tsx` with `AuthScreen.tsx` (Email+Password Sign In/Up with `display_name`, Password Reset, missing `.env` guide); preserve `?invite=CODE` query param across auth for GitHub Pages compatibility | M2 | Plan §2, Survey 1 & 3 |
| F8 | Profile & Campaign Hub | Build `ProfileCampaignHub.tsx` (`profiles` editor, joined campaigns with `Normal`/`West Marches` & role badges, Create Campaign with optional starter seed & sheet preset, Join by invite code, Manage Campaign links/roles/kick, My Characters overview) | M2 | Plan §2, Survey 1 & 3 |
| F9 | Modular Store Refactor & LocalStorage Removal | Remove all 4 vault `localStorage` keys and eager `buildSeedDataset()` import; decompose `useVaultStore.ts` into `campaignSync.ts` + 7 typed slices (`authSlice`, `campaignSlice`, `worldLoreSlice`, `characterSlice`, `journalSlice`, `vttSlice`, `uiSlice`); multi-campaign `activeCampaignId` switching; filtered `map_pins`/`map_paths` queries | M2 | Plan §3, Survey 1 |
| F10 | Effective GM Enforcement & Cloud Undo/Redo | Compute `isEffectiveGm = (myRole === 'gm' || myRole === 'co_gm') && gmMode`; block player `gmMode` elevation; gate `TopHeader` toggle & mutations; sync `undo()`/`redo()` diffs to Supabase; refactor lazy `seedStarterCampaign` uploading terrain PNGs to Storage | M2 | Plan §3, Survey 1 |
| F11 | JSON Campaign Archive v2 (Import & Export) | Implement `src/lib/campaignArchive.ts` (`CampaignArchiveV2` export + `importCampaignJson` with UUID remapping & `data:` URL upload) wired into `TopHeader.tsx` & `ProfileCampaignHub.tsx` + `campaignArchive.test.ts` | M2 | Plan §9, Survey 1 & 3 |
| F12 | Tab System & Settings Cleanup | Extend `TabItem['kind']` (`journal`, `character`, `sheet_studio`, `timeline`, `profile_hub`) in `vault.ts` and `App.tsx` `renderTabContent`; move `inspectorWidth` to store; update `SettingsModal.tsx` to remove legacy demo/token text | M2 | Plan §2 & §9, Survey 2 & 3 |
| F13 | Security: Harden Note/Journal HTML & CSS Sanitizer | Harden `sanitizeNoteHtml`, `scopeCustomCss`, `buildImgTag`, and `<style>` handling in `src/lib/wikilinks.ts` against stored XSS / CSS breakout / `javascript:` URLs before player-to-player sharing + `wikilinks.test.ts` | M3 | Plan §5 & §9, Survey 3 |
| F14 | Player Journals & Granular Sharing | Extract reusable `MarkdownGrimoireEditor.tsx`; build `PlayerJournalsPane.tsx` (`My Journal` + `Shared With Me`, WikiLinks, tags) and `JournalShareModal.tsx` (`private` / `selected` with `can_edit` / `campaign`) synced via Realtime | M3 | Plan §5, Survey 3 |
| F15 | Campaign Timeline & Custom Fantasy Calendar | Build `CampaignTimelinePane.tsx` aggregating `timeline_events` and linked `Chronicle`/`Event`/`Session`/`History` entities with custom Fantasy Calendar config (era, months, weekdays, date stepper) & GM-only visibility filtering | M3 | Plan §8, Survey 3 |
| F16 | Sidebar, Inspector & Command Palette Extensions | Update `LeftSidebar.tsx` (replace hardcoded `"Shattered Reach"`, add Journals/Characters/Sheet Studio/Timeline/Profile sections, role-gate GM actions); update `RightInspector.tsx` context cards & responsive `ConnectionsGraph.tsx`; extend `CommandPalette.tsx` (fix `"2D Battlemap"` subtitle, index characters/journals/timeline) | M3 | Plan §2, §5, §6, §8, Survey 2 & 3 |
| F17 | Safe Roll20 Sheet Engine & Starter Presets | Implement `src/lib/sheetEngine.ts` (safe expression parser for `@{attr}`, arithmetic, `floor/ceil/round/max/min/abs`, `repeating_<sec>_<row>_<field>`, roll macros; zero `eval`) + `src/data/sheetPresets.ts` (`5e Fantasy Adventurer` & `Minimal Narrative`) + `sheetEngine.test.ts` | M4 | Plan §6 & §9, Survey 3 |
| F18 | Roll20 Sheet Template Studio & Sandboxed Runtime | Build `SheetTemplateStudio.tsx` (3-pane HTML/CSS/JSON editor + live preview) and `SandboxedCharacterSheet.tsx` (`<iframe sandbox="allow-scripts" srcDoc>`, typed `postMessage` bridge, `attr_*` hydration, repeating `+ Add`/`Delete`, debounced Supabase save, roll triggers) | M4 | Plan §6, Survey 3 |
| F19 | Character Manager & Token Linker | Build `CharacterManagerPane.tsx` (CRUD, West Marches 1-active-char enforcement, Lore `Entity` & 2D token linking) and add character/owner assignment UI in `BattlemapInspectorSection.tsx` | M4 | Plan §6, Survey 1 & 3 |
| F20 | Realtime Dice Parser, Roller Drawer & Roll Log | Implement `src/lib/diceParser.ts` (`1d20+5`, `2d20kh1`, `2d20kl1`, `4d6dl1`, `d100`, `@{attr}` interpolation, GM blind rolls) + `DiceRollerDrawer.tsx` (Realtime `dice_rolls` log, sheet roll integration, `TopHeader` toggle) + `diceParser.test.ts` | M4 | Plan §8 & §9, Survey 3 |
| F21 | Per-Player Fog of War Mask Engine & Tests | Implement `src/lib/fogOfWarMask.ts` (`256x256` grayscale canvas mask, brush reveal/hide, radius reveal, PNG Blob export for `vault-assets`, multi-mask union compositing `max(own, ...shared)` into GPU `DataTexture` / 2D overlay) + `fogOfWarMask.test.ts` | M5 | Plan §7 & §9, Survey 2 |
| F22 | 3D Fog Shader Injection, Fog Brush & Map Sharing | Extract terrain shader builders into `src/lib/terrainShaders.ts`; inject composited per-player fog `DataTexture` into 3D terrain & ocean shaders; add GM 3D Fog Brush (target player/all/baseline) & player "Share My Map Showings" UI (`map_fog_shares`) in `RightInspector.tsx` / `MapViewport3D.tsx` | M5 | Plan §7 & §9, Survey 2 |
| F23 | West Marches Guild Quest Boards (3D & 2D) | Build `GuildQuestBoardModal.tsx` (GM create/edit/archive quests with `max_players` cap, Player accept/withdraw via `signup_for_guild_quest` RPC); add GM placement tool & interactive Quest Board 3D marker / 2D badge in `MapViewport3D.tsx` & `BattlemapViewport2D.tsx` | M5 | Plan §4, Survey 2 |
| F24 | 2D Battlemap Persistent Fog, Token Ownership & VTT Polish | Add persistent 2D Fog of War + GM brush, player token ownership enforcement & GM-hidden item filtering, cursor-centered wheel zoom, cached visibility polygons (`battlemapLighting.test.ts`), AoE templates, and `InitiativeTrackerBar.tsx` (turn order, round counter, conditions, linked sheet click-to-open) | M5 | Plan §7, §8, §9, Survey 2 |
| F25 | 3D Worldsmith UX/Sync Fixes & Safe-Inset Layout | Route `Ctrl+Z` to 3D terrain sculpt undo when in Worldsmith mode; upload sculpted terrain PNGs via `uploadAssetDataUrlOrBlob`; apply `inspectorWidth` right-edge safe-insets across `MapViewport3D`, `BattlemapViewport2D`, `PinEntitySlideOver`; auto-open `RightInspector` on Worldsmith mode; animate rivers/windmill & add 3D fog gizmo | M5 | Plan §7, §8, §9, Survey 1 & 2 |
| F26 | Comprehensive README Documentation | Rewrite `README.md` with architecture overview, Supabase setup (`schema.sql`, Storage, `.env`), Normal vs West Marches guide, Roll20 sheet authoring reference, and keyboard shortcuts | M5 | Plan §9, Survey 3 |
| F27 | E2E Testing Track (Tiers 1–4 Opaque-Box Suite) | Independent opaque-box E2E test infrastructure (`TEST_INFRA.md`) + 4-tier test suite covering every Feature Inventory item + `TEST_READY.md` | E2E Track | Dual Track |
| F28 | Final E2E Pass (Tiers 1–4) + Tier 5 Hardening + Audit | Pass 100% of E2E Tiers 1–4 sequentially, run Tier 5 adversarial white-box coverage hardening, pass whole-project Forensic Audit & `lint`/`test`/`build` | M6 | Plan §Verification, Dual Track |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Supabase Schema, RLS, RPCs, Storage & Tooling Foundation | `supabase/schema.sql`, `package.json`, `vitest.config.ts`, `eslint.config.js`, `.github/workflows/*` (F1–F5) | none | DONE (verified Cycle 2, 9/9 tests, lint/build pass) |
| M2 | Web-Only Auth, Types, Storage Client, Profile Hub & Store Slices | `types/vault.ts`, `supabase.ts`, `campaignSync.ts`, `campaignArchive.ts`, `store/slices/*`, `AuthScreen.tsx`, `ProfileCampaignHub.tsx`, `TopHeader.tsx`, `SettingsModal.tsx`, `App.tsx`, delete legacy lock/auth modals (F6–F12) | M1 | IN_PROGRESS (conv: b27ad76a705a08ee4a07f673403f09d0) |
| M3 | Player Journals, Security Sanitizer, Timeline/Calendar & Navigation | `wikilinks.ts`, `MarkdownGrimoireEditor.tsx`, `NoteEditorPane.tsx`, `journals/*`, `CampaignTimelinePane.tsx`, `LeftSidebar.tsx`, `RightInspector.tsx`, `ConnectionsGraph.tsx`, `CommandPalette.tsx`, `wikilinks.test.ts` (F13–F16) | M2 | PLANNED |
| M4 | Roll20 Custom Character Sheet Studio, Characters & Realtime Dice | `sheetEngine.ts`, `sheetPresets.ts`, `diceParser.ts`, `sheets/*`, `DiceRollerDrawer.tsx`, `BattlemapInspectorSection.tsx`, `App.tsx`/`TopHeader.tsx` dice wiring, `sheetEngine.test.ts`, `diceParser.test.ts` (F17–F20) | M3 | PLANNED |
| M5 | 3D/2D Per-Player Fog, Map Sharing, Quest Boards, 2D/3D VTT & README | `fogOfWarMask.ts`, `terrainShaders.ts`, `GuildQuestBoardModal.tsx`, `InitiativeTrackerBar.tsx`, `MapViewport3D.tsx`, `WorldsmithMeshes3D.tsx`, `PinEntitySlideOver.tsx`, `BattlemapViewport2D.tsx`, `RightInspector.tsx` fog UI, `fogOfWarMask.test.ts`, `battlemapLighting.test.ts`, `README.md` (F21–F26) | M4 | PLANNED |
| E2E | E2E Testing Track (Opaque-Box Suites) | `TEST_INFRA.md`, `e2e/` opaque-box harness & Tiers 1–4 suites, `TEST_READY.md` (F27) — coordinates `package.json` after M1 | M1 (for pkg deps) | IN_PROGRESS (conv: cdb679df0555691e96be31df9709e42e) |
| M6 | Final Milestone: 100% E2E Pass (Tiers 1–4) + Tier 5 Hardening | Phase 1 E2E Tiers 1–4 pass; Phase 2 Tier 5 Challenger hardening; whole-project Forensic Audit + final `lint`/`test`/`build` (F28) | M5, E2E (`TEST_READY.md`) | PLANNED |

---

## Interface Contracts

### 1. Supabase Schema & RPCs (`supabase/schema.sql`)
- Helper functions (`SECURITY DEFINER`, `SET search_path = public`):
  - `public.is_campaign_member(cid uuid) returns boolean`
  - `public.is_campaign_gm(cid uuid) returns boolean` (true for `role in ('gm', 'co_gm')`)
- RPCs (`SECURITY DEFINER`):
  - `public.join_campaign_by_invite(p_invite_code text) returns uuid` (joins caller as `'player'`, returns `campaign_id`)
  - `public.signup_for_guild_quest(p_quest_id uuid, p_character_id uuid, p_note text) returns uuid` (`FOR UPDATE` row lock on `guild_quests`, validates ownership & `count < max_players`, inserts `guild_quest_signups`, updates `status = 'full'` when full)
  - `public.withdraw_from_guild_quest(p_quest_id uuid) returns void` (deletes caller's signup, reopens `'full'` -> `'open'` when count < `max_players`)
- Triggers:
  - `on_auth_user_created` -> inserts `public.profiles`
  - `on_world_created` -> inserts `(new.id, new.owner_id, 'gm')` into `public.campaign_members`
  - `enforce_west_marches_single_active_char` (`BEFORE INSERT OR UPDATE` on `public.characters`) -> locks `(campaign_id, user_id)` and rejects `is_active = true` if `worlds.mode = 'west_marches'` and another active character exists for `(campaign_id, user_id)`
- Storage bucket `vault-assets`: public read (`SELECT`), authenticated upload/update/delete (`auth.role() = 'authenticated'`).

### 2. Core Types & Store Contract (`src/types/vault.ts`, `src/store/useVaultStore.ts`)
- `CampaignMode = 'normal' | 'west_marches'`; `CampaignRole = 'gm' | 'co_gm' | 'player'`.
- `TabKind = 'map' | 'entity' | 'asset' | 'template' | 'journal' | 'character' | 'sheet_studio' | 'timeline' | 'profile_hub'`.
- `BattlemapToken` adds `character_id?: string | null`, `owner_user_id?: string | null`, `conditions?: string[]`, `elevationFt?: number`, `auraRadiusFt?: number`.
- `BattlemapData` adds `fogOfWarEnabled?: boolean`, `revealedMaskUrl?: string | null`, `aoeTemplates?: BattlemapAoeTemplate[]`.
- `VaultMap` adds `fog_of_war_2d?: string | null`, `combat_state?: BattlemapCombatState | null`.
- Store root exposes:
  - `isEffectiveGm: () => boolean` (`(myRole === 'gm' || myRole === 'co_gm') && gmMode`)
  - `canEditToken: (token: BattlemapToken) => boolean`
  - `inspectorWidth: number` + `rightInspectorCollapsed: boolean` (viewports compute `rightInsetPx = rightInspectorCollapsed ? 12 : inspectorWidth + 12`)
  - `uploadAssetDataUrlOrBlob(source: File | Blob | string, folder: string, filename?: string): Promise<string>`

### 3. Roll20 Sheet Engine & Sandbox `postMessage` Contract (`src/lib/sheetEngine.ts`, `SandboxedCharacterSheet.tsx`)
- `<iframe sandbox="allow-scripts" srcDoc={...}>` (no `allow-same-origin`), verified by `event.source === iframeRef.current?.contentWindow` and per-mount `instanceId`.
- Parent -> Iframe: `{ type: 'SHEET_HYDRATE', instanceId, attributes, computed, readOnly }`
- Iframe -> Parent:
  - `{ type: 'SHEET_ATTR_CHANGE', instanceId, patch }`
  - `{ type: 'SHEET_REPEAT_ADD', instanceId, section }`
  - `{ type: 'SHEET_REPEAT_DELETE', instanceId, section, rowId }`
  - `{ type: 'SHEET_ROLL', instanceId, label, expression }`

### 4. Fog of War & Dice Contracts (`src/lib/fogOfWarMask.ts`, `src/lib/diceParser.ts`)
- `fogOfWarMask.ts`: `FOG_MASK_SIZE = 256`; `createFogMask(fillValue)`, `paintFogCircle(mask, normX, normZ, radiusNorm, reveal)`, `unionFogMasks(masks: Uint8Array[])`, `maskToCanvasBlob(mask)`, `loadMaskFromUrl(url)`.
- `diceParser.ts`: `parseAndRollDice(rawExpression: string, attrs?: Record<string, unknown>, rng?: () => number): DiceRollResult` returning `{ expression, resolvedExpression, total, breakdown, isCrit, isFumble }`.

---

## Code Layout

```text
/home/antigravity/KrystianRobak/WebSi/
├── .env.example
├── .github/workflows/
│   ├── deploy.yml                        # [MODIFY] Drop VITE_GM_EMAIL; run lint + test + build
│   └── ci.yml                            # [NEW] PR + push CI (lint, test, build)
├── eslint.config.js                      # [NEW] ESLint v9 flat config
├── vitest.config.ts                      # [NEW] Vitest config
├── package.json                          # [MODIFY] Add vitest, jsdom, eslint stack & test script
├── README.md                             # [MODIFY] Full setup, architecture, sheet guide, shortcuts
├── PROJECT.md                            # [NEW] Authoritative project index
├── TEST_INFRA.md                         # [NEW] E2E Testing Track infra
├── TEST_READY.md                         # [NEW] E2E completion signal
├── supabase/
│   └── schema.sql                        # [MODIFY] Full web-only multi-campaign schema, RLS, RPCs, storage
├── e2e/                                  # [NEW] Opaque-box E2E tests (Tiers 1–4)
└── src/
    ├── App.tsx                           # [MODIFY] AuthScreen gate, extended tab router, DiceDrawer, Ctrl+Z router
    ├── types/vault.ts                    # [MODIFY] Full multi-campaign, VTT, Sheet, Journal, Timeline types
    ├── data/
    │   ├── seedData.ts                   # [MODIFY] Lazy starter seeding helper only (no module-load run)
    │   ├── templates.ts                  # [KEEP]
    │   └── sheetPresets.ts               # [NEW] Built-in Roll20 presets (5e + Minimal Narrative)
    ├── lib/
    │   ├── supabase.ts                   # [MODIFY] Pure env/session client + uploadAssetDataUrlOrBlob
    │   ├── campaignSync.ts               # [NEW] Map/template serializers, undo cloud diff sync, lazy seed
    │   ├── campaignArchive.ts            # [NEW] JSON v2 export & UUID-remapping import
    │   ├── sheetEngine.ts                # [NEW] Safe Roll20 formula/repeating-row/macro engine
    │   ├── diceParser.ts                 # [NEW] Dice notation parser & roller
    │   ├── fogOfWarMask.ts               # [NEW] 256x256 fog masks, painting, PNG blob, union compositing
    │   ├── terrainShaders.ts             # [NEW] Extracted 3D terrain & ocean shaders with fog texture support
    │   ├── wikilinks.ts                  # [MODIFY] Hardened HTML/CSS sanitizer
    │   ├── battlemapLighting.ts          # [KEEP]
    │   └── __tests__/                    # [NEW] Unit tests (diceParser, sheetEngine, fogOfWarMask, wikilinks, battlemapLighting, campaignArchive)
    ├── store/
    │   ├── useVaultStore.ts              # [MODIFY] Root store combining typed slices
    │   └── slices/                       # [NEW] authSlice, campaignSlice, worldLoreSlice, characterSlice, journalSlice, vttSlice, uiSlice
    └── components/
        ├── auth/AuthScreen.tsx           # [NEW]
        ├── profile/ProfileCampaignHub.tsx# [NEW]
        ├── layout/{TopHeader,LeftSidebar,RightInspector}.tsx # [MODIFY]
        ├── editor/{MarkdownGrimoireEditor,NoteEditorPane}.tsx # [NEW/MODIFY]
        ├── journals/{PlayerJournalsPane,JournalShareModal}.tsx # [NEW]
        ├── sheets/{SheetTemplateStudio,SandboxedCharacterSheet,CharacterManagerPane}.tsx # [NEW]
        ├── timeline/CampaignTimelinePane.tsx # [NEW]
        ├── quests/GuildQuestBoardModal.tsx # [NEW]
        ├── vtt/DiceRollerDrawer.tsx      # [NEW]
        ├── map/{MapViewport3D,WorldsmithMeshes3D,PinEntitySlideOver}.tsx # [MODIFY]
        ├── battlemap/{BattlemapViewport2D,InitiativeTrackerBar}.tsx # [MODIFY/NEW]
        ├── inspector/{BattlemapInspectorSection,ConnectionsGraph}.tsx # [MODIFY]
        └── modals/
            ├── {SettingsModal,CommandPalette}.tsx # [MODIFY]
            ├── VaultLockScreen.tsx       # [DELETE]
            └── AuthModal.tsx             # [DELETE]
```
