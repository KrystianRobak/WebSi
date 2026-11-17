# TEST_INFRA — Aethelgard Vault Opaque-Box E2E Test Infrastructure

## 1. Test Philosophy
- **Opaque-Box, Requirement-Driven**: Every test case is derived strictly from [`ORIGINAL_REQUEST.md`](.agents/teamwork/ORIGINAL_REQUEST.md) and [`PROJECT.md`](PROJECT.md) (`§ Feature Inventory` and `§ Interface Contracts`), never from internal implementation details or private store/helper imports.
- **Zero App Modification**: Tests never import from `src/` or `supabase/` and never inject mock modules into the application bundle. The unmodified Vite web app runs in headless Chromium (`156.x` with SwiftShader WebGL2) against either a **deterministic local Supabase protocol server** (Auth, PostgREST, RPCs, Storage, Realtime WebSocket) or a **live Supabase project** via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **Multi-User Isolation**: Simultaneous GM, Player A, and Player B sessions run in separate Playwright `BrowserContext`s (`persistSession: true` storage isolated per context) to verify real-time convergence, RLS boundaries, fog sharing, journal sharing, and quest cap races.
- **Progressive Testability**: Verification of foundational features (Auth, Profile Hub, Campaign creation/joining) never depends on higher-complexity features (3D shaders, Sheet Studio, Battlemap Initiative).
- **Mandatory Negative & Adversarial Coverage**: Every feature includes explicit negative, boundary, permission, XSS/CSS-breakout, and concurrency-race tests verifying graceful error handling without crashes.

---

## 2. User-Facing Feature Inventory (`N = 20`)

| UF ID | User-Facing Feature | `PROJECT.md` Features | `ORIGINAL_REQUEST.md` Source |
|---|---|---|---|
| `UF-01` | Web-Only Auth, Session Persistence & `?invite=CODE` Flow | F1, F6, F7 | Design Decision #1 ("Supabase Auth (Email + Password)... campaign invite codes/links") |
| `UF-02` | Player Profile Editor & Campaign Hub Dashboard | F1, F8 | "Create Player profile where he can signup to campaigns, manage his campaigns" |
| `UF-03` | Campaign Creation (Normal/WM), Invite Join & Multi-Campaign Switching | F1, F8, F9 | "Allow campaigns to be normal or West Marches modes" |
| `UF-04` | Member Management & Effective GM Role Enforcement | F1, F8, F10 | Design Decision #1 & #4 ("strict RLS permissions", "Role-based Player View") |
| `UF-05` | Cloud Undo/Redo & Lazy Starter Campaign Seeding | F9, F10, F25 | "leaving aside the local database. We go web only." |
| `UF-06` | JSON Campaign Archive v2 Export & UUID-Remapped Import | F6, F11 | Plan §9 JSON Campaign Backup & Restore |
| `UF-07` | Workspace Shell, Tab Router, LeftSidebar, RightInspector & CommandPalette | F12, F16 | Plan §2, §5, §6, §8 workspace shell |
| `UF-08` | Note/Journal HTML & Scoped CSS Sanitizer + WikiLinks | F13 | Security prerequisite for shared journals & lore notes |
| `UF-09` | Player Journals & Granular Page-Level Sharing | F4, F14 | "Each player has its own journal... allow possibility to share pages or given notes" |
| `UF-10` | Campaign Timeline & Custom Fantasy Calendar | F4, F15 | Design Decision #4 ("Campaign Timeline & Custom Fantasy Calendar view") |
| `UF-11` | Roll20 Sheet Presets & Safe Expression/Macro Engine | F2, F17 | Design Decision #3 (`attr_*` bindings & `[[roll]]` buttons) |
| `UF-12` | Roll20 Sheet Template Studio & `<iframe sandbox="allow-scripts">` Runtime | F2, F18 | "allow making custom character sheets like on roll20... Pure Code Editor: HTML + CSS + JSON/formula" |
| `UF-13` | Character Manager, West Marches 1-Active-Char Rule & Token Linking | F2, F19 | Design Decision #2 ("one character per player in West Marches Campaign") |
| `UF-14` | Realtime Dice Parser, DiceRollerDrawer & Roll Log | F4, F20 | Design Decision #4 ("Real-time Dice Roller & Roll Log... synced via Supabase Realtime") |
| `UF-15` | Per-Player 3D Fog of War, GM Fog Brush & Player Map Sharing | F4, F6, F21, F22 | Design Decision #5 ("Per-player 2D grid/mask texture draped over 3D terrain... union together") |
| `UF-16` | West Marches Guild Quest Boards (3D & 2D) & Atomic Player-Cap Signups | F3, F23 | Design Decision #2 ("Added to MAP as kind of token or board... accept task with caps on amount of players") |
| `UF-17` | 2D Battlemap Persistent Fog, Token Ownership & GM-Hidden Filtering | F4, F24 | Design Decision #4 ("Persistent Fog of War brush/mask on 2D Battlemap", "only move their own assigned tokens") |
| `UF-18` | 2D Battlemap Initiative Tracker, AoE Templates & Cursor-Centered Zoom | F4, F24 | Design Decision #4 ("Combat Initiative & Turn Tracker on 2D Battlemap") |
| `UF-19` | 3D Worldsmith Sculpt Undo, Storage Texture Sync & Safe-Inset Layout | F4, F6, F25 | Plan §7, §8, §9 3D Worldsmith & layout ergonomics |
| `UF-20` | Cross-Campaign & Storage Bucket RLS Isolation | F1–F4, F6, F9, F10 | Design Decision #1 ("real per-player accounts and strict RLS permissions") |

> **Non-Runtime / Meta Features Disposition**:
> - **F5 (Tooling: Vitest, ESLint & CI Workflows)**: Pre-E2E build/lint/unit-test gate (`npm run lint`, `npm test`, `npm run build`); verified directly in M1 and M6 rather than as a browser runtime UI feature.
> - **F26 (Comprehensive README Documentation)**: Static repository documentation (`README.md`); runtime missing-`.env` setup guidance is tested via `UF-01` (`T1-001`).
> - **F27 / F28**: Meta-track deliverables (this E2E suite + M6 Final Pass / Tier 5 Hardening).

---

## 3. Test Architecture & Harness (`e2e/`)

### 3.1 Self-Contained Workspace
`e2e/` maintains its own `e2e/package.json` and `e2e/tsconfig.json` independent from root `package.json`:
- **Runner**: `@playwright/test` (`1.65.x`) + `ws` (`8.x`) + `@supabase/supabase-js` (`2.119.0`, used **only** by harness self-tests & test-data provisioning fixtures, never by `src/`).
- **Browser**: System Chromium (`/usr/lib/chromium/chromium`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) launched with verified ANGLE/SwiftShader WebGL2 flags:
  `--no-sandbox --disable-gpu-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist`.

### 3.2 Dual-Mode Supabase Execution
1. **Local Deterministic Protocol Mode (Default in CI / M6)**:
   - `e2e/harness/supabaseProtocolServer.ts` starts an ephemeral local HTTP + WebSocket server implementing the exact Supabase JS v2.119.0 wire protocol:
     - **Auth (`/auth/v1/*`)**: `signup` (auto-creating `profiles`), `token?grant_type=password`, `token?grant_type=refresh_token`, `user`, `logout`, `recover`, HS256-like signed JWTs with expiry & revocation.
     - **PostgREST (`/rest/v1/<table>`)**: `GET`/`POST`/`PATCH`/`DELETE`/`HEAD`, `select`, `eq`/`neq`/`in`/`is`/`gt`/`gte`/`lt`/`lte`/`or`, `order`, `limit`/`offset`, `Prefer: return=representation|minimal`, `Prefer: resolution=merge-duplicates` (`on_conflict`), `Prefer: count=exact` (`Content-Range`), and `Accept: application/vnd.pgrst.object+json` (`PGRST116` on 0/multi rows).
     - **RPCs (`/rest/v1/rpc/*`)**: `join_campaign_by_invite`, `signup_for_guild_quest` (atomic mutex simulating `FOR UPDATE` row lock + ownership/cap checks + auto `'full'`), `withdraw_from_guild_quest` (auto `'open'`).
     - **RLS & Triggers**: Creator auto-GM in `campaign_members`; `worlds` visibility gated by membership; `enforce_west_marches_single_active_char` trigger; `journal_pages` + `journal_page_shares` (`private`/`selected`/`campaign`, `can_edit`); `map_fog_states` + `map_fog_shares` visibility; `is_gm_only` & `is_gm_blind` filtering; non-GM mutation blocks (`42501`).
     - **Storage (`/storage/v1/*`)**: Authenticated upload/delete on `vault-assets`, public GET with accurate `Content-Type`, `Access-Control-Allow-Origin: *`, and `Cross-Origin-Resource-Policy: cross-origin` (preventing canvas tainting in `fogOfWarMask` / 3D shaders).
     - **Realtime (`/realtime/v1/websocket`)**: Phoenix protocol (`vsn=1.0.0` & `vsn=2.0.0`) supporting `phx_join`, `heartbeat`, `broadcast`, and RLS-filtered `postgres_changes` emissions on every DB mutation.
   - `e2e/harness/appServer.ts` builds (`vite build`) or serves (`vite preview`) the unmodified production app against the protocol server's dynamic URL & anon key.
2. **Live Supabase Mode (Optional)**:
   - Setting `E2E_SUPABASE_URL` and `E2E_SUPABASE_ANON_KEY` (plus optional `E2E_SUPABASE_SERVICE_ROLE_KEY`) points the exact same Tier 1–4 suite at a real Supabase project.

### 3.3 Directory Structure
```text
e2e/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── harness/
│   ├── supabaseProtocolServer.ts   # Full Auth/PostgREST/RPC/Storage/Realtime simulator + RLS/triggers
│   ├── appServer.ts                # Vite build/preview runner with dynamic VITE_SUPABASE_* env
│   └── harness.self.test.ts        # Self-tests verifying protocol server + Chromium WebGL2 + iframe sandbox
├── fixtures/
│   ├── e2eFixtures.ts              # Worker/test fixtures: protocolServer, multi-user contexts (gm/playerA/playerB)
│   └── sampleData.ts               # Valid & malformed CampaignArchiveV2 JSON, Roll20 HTML/CSS/JSON presets, PNG blobs
├── helpers/
│   ├── uiActions.ts                # Opaque-box DOM/URL helpers (auth, hub, sidebar, tabs, modals, iframe, canvas)
│   └── protocolAdmin.ts            # Test-only REST assertions to verify RLS/DB side effects independent of UI
└── tests/
    ├── tier1/                      # 100 atomic functional tests (T1-001..T1-100) across 20 spec files
    ├── tier2/                      # 100 edge/boundary/permission/negative tests (T2-001..T2-100) across 20 spec files
    ├── tier3/                      # 24 pairwise integration tests (T3-01..T3-24)
    └── tier4/                      # 10 real-world multi-user E2E scenarios (T4-01..T4-10)
```

---

## 4. Coverage Thresholds & Tier Breakdown

With `N = 20` user-facing features (`N >= 16`):
- **Tier 1 (Atomic Functional)**: Required `>= 5 * N = 100` -> **100** cases (`T1-001`..`T1-100`, 5 per UF)
- **Tier 2 (Edge, Boundary & Negative)**: Required `>= 5 * N = 100` -> **100** cases (`T2-001`..`T2-100`, 5 per UF)
- **Tier 3 (Pairwise Integration)**: Required `>= N = 20` -> **24** cases (`T3-01`..`T3-24`)
- **Tier 4 (Real-World Multi-User Scenarios)**: Required `>= max(5, ceil(N/2)) = 10` -> **10** cases (`T4-01`..`T4-10`)
- **Total Opaque-Box Cases**: **234**

---

## 5. Tier 4 Real-World Application Scenarios (`T4-01`..`T4-10`)

1. **`T4-01` — West Marches Onboarding, `?invite=CODE` Preservation & Single-Character Enforcement**: GM creates West Marches campaign -> Player A & B join via `/?invite=CODE` across auth -> Player A capped at 1 active character -> GM verifies hub badges; players lack GM toggle.
2. **`T4-02` — Guild Quest Board 3D Expedition & Atomic Cap Contention**: GM places 3D Quest Board + quest (`max_players = 1`) -> Player A & B view live -> Player A accepts (`full`) -> Player B blocked -> Player A withdraws (`open`) -> Player B claims slot.
3. **`T4-03` — Roll20 Sheet Studio -> Sandboxed Iframe Hydration -> Realtime Dice Log**: GM authors HTML/CSS/JSON sheet -> Player A & B open sandboxed iframes -> computed attributes & repeating rows persist -> `[[roll]]` broadcasts live to all users; GM blind roll stays hidden from players.
4. **`T4-04` — Per-Player 3D Fog of War & Peer-to-Peer Map Sharing**: GM reveals distinct regions for Player A and Player B -> isolation verified -> Player A shares showings with Player B -> union mask reveals both regions on Player B's 3D viewport -> revoking share restores isolation.
5. **`T4-05` — Player Journals, Granular Sharing, Collaborative Edit & XSS/CSS Defense**: Player A writes private note with `[[WikiLink]]` + `<script>`/`onerror=`/`<style>` breakout -> isolated from GM & Player B -> shared with Player B (`can_edit = true`) -> XSS neutralized, shell CSS intact, live collaborative edit converges.
6. **`T4-06` — Live 2D Battlemap Combat: Persistent Fog, Token Ownership, Hidden Enemies & Initiative**: GM links tokens, hides ambush token, paints 2D fog -> players see only owned/visible tokens & cleared areas -> Player A cannot drag Player B's token -> GM runs Initiative rounds + conditions + AoE -> Player A opens linked sheet from tracker & rolls.
7. **`T4-07` — 3D Worldsmith Sculpt Undo, Storage Sync & Fantasy Calendar Progression**: GM enters Worldsmith (`RightInspector` auto-opens, HUD safe-insets respected), sculpts, `Ctrl+Z` undoes stroke, uploads terrain PNG to Storage -> configures custom calendar & steps date + public/GM-only timeline events -> Player A sees terrain & public timeline only.
8. **`T4-08` — Multi-Campaign Isolation, Normal Multi-Char Mode & JSON Archive Cloning**: GM runs WM Campaign 1 + Normal Campaign 2 (Player A only) -> Player A holds 2 active chars in Campaign 2 & 1 in Campaign 1 -> Player B excluded from Campaign 2 -> GM exports & UUID-remapped imports Campaign 1 to Campaign 3 cleanly.
9. **`T4-09` — Co-GM Promotion, Collaboration & Member Kick Lifecycle**: GM promotes Player A to `co_gm` -> Player A unlocks GM Mode & Sheet Studio -> GM demotes Player A and kicks Player B -> Player A loses GM powers, Player B loses campaign access.
10. **`T4-10` — Full Session Persistence, `Ctrl+K` Command Palette & Cross-Feature Recovery**: GM & Player A reload browser across active tabs -> sessions auto-restore without localStorage vault -> `CommandPalette` navigates across 2D Battlemaps, characters, journals, and timeline with all cloud edits intact.

---

## 6. Verification & Readiness Gates
- **Before `TEST_READY.md` (E2E Track F27)**:
  - `e2e/` TypeScript compilation (`npx tsc --noEmit`) passes with 0 errors.
  - Harness self-tests (`npx playwright test --project=harness-selftest`) pass 100% against Chromium + SwiftShader WebGL2 + local Supabase protocol server.
  - Playwright test discovery (`npx playwright test --list`) discovers all `234` Tier 1–4 cases (+ harness self-tests) with 0 skips/placeholders.
  - Verification Wave (2 Reviewers + 2 Challengers + 1 Forensic Auditor) passes unconditionally (`CLEAN`, `APPROVE`, `CONFIRMED`) with zero edits to `src/`, `supabase/`, or root `package.json`.
- **In Final Milestone (`M6`)**:
  - Execute Tier 1 -> Tier 2 -> Tier 3 -> Tier 4 sequentially against the built M5 production app (`100%` pass required) + Tier 5 adversarial white-box coverage hardening + whole-project Forensic Audit.
