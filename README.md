# Aethelgard Vault — Web-Only TTRPG Campaign Studio & Worldbuilding VTT

A web-only React 18 + TypeScript + Vite + Three.js/R3F + Supabase campaign studio supporting **Normal** and **West Marches** campaigns, **Player Profile & Roster Hubs**, **Roll20-Style Custom Character Sheet Studio**, **3D Worldsmith Maps**, and **2D Tactical Battlemaps**.

---

## Key Features

- **Web-Only Architecture & Real-Time Collaboration:** Backed exclusively by Supabase Auth, Postgres (with strict Row-Level Security & atomic `SECURITY DEFINER` RPCs), Realtime broadcast channels, and `vault-assets` object storage.
- **Normal & West Marches Campaigns:**
  - Switch seamlessly or create campaigns in `normal` or `west_marches` mode.
  - Atomic database constraints enforce single active character per player in West Marches mode, cap enforcement on guild quests (`max_players`), and role-based permissions (`gm`, `co_gm`, `player`) with a **Preview as Player** toggle for GMs.
  - Full **JSON Campaign Archive Export / Import** and interactive **Wiki & Timeline Chronicle** with custom fantasy calendars.
- **Player Profile & Cross-Campaign Character Roster (`Adventurer Account`):**
  - Manage display name, bio, avatar, campaign sign-ups via invite code, active campaign switching, and characters across all joined campaigns.
- **Roll20-Style Custom Character Sheet Studio:**
  - Safe sandboxed HTML/CSS/Formula sheet rendering (`iframe[sandbox="allow-scripts"]` without `allow-same-origin`, `eval`, or `new Function`), auto-computed derived stats, inline `[[roll]]` expressions, and a live split-pane **Sheet Studio** with presets (**D&D 5e** and **West Marches Minimalist**).
- **3D Interactive Worldsmith & Atlas Viewport:**
  - Real-time 3D terrain sculpting with undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`), heightmap/biome paint persistence to Supabase Storage, animated rivers & windmills, 3D Fog Volumes, per-player **3D Fog of War** painting with peer map sharing, and interactive **West Marches Guild Quest Boards**.
- **2D Tactical Battlemap VTT:**
  - Raycast dynamic lighting & line-of-sight shadows, doors/walls/traps/props, persistent 2D **Fog of War** masks, player token ownership drag via RPC, **AoE spell templates** (`circle`, `cone`, `line`, `square`), cursor-centered wheel zoom, and a live **Initiative Tracker** with round cycling, condition badges, and linked character sheet opening.
- **Shared Dice Roller & Log:**
  - Supports expressions like `1d20+@{str_mod}`, advantage/disadvantage (`2d20kh1` / `2d20kl1`), and GM blind rolls.

---

## Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment variables:**
   Copy `.env.example` to `.env` (or `.env.local`) and provide your Supabase project URL and anon key:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. **Provision the Supabase database & storage:**
   - Execute `supabase/schema.sql` in the Supabase SQL Editor (creates all tables, RLS policies, atomic RPCs, triggers, and the `vault-assets` storage bucket).
4. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## Verification & Testing

- **Lint, Unit Tests & Production Build:**
  ```bash
  npm run lint && npm test && npm run build
  ```
- **End-to-End Playwright Suite (Tiers 1–4):**
  ```bash
  cd e2e
  npm install
  npm run test
  ```

---

## Shortcuts

- `Ctrl/Cmd + S` — Sync active editor document
- `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` — Undo / Redo (3D Terrain Sculpt in Worldsmith mode, or World Lore history in Atlas mode)
- `T` — Toggle Top-Down / 3D Perspective camera on 3D maps
- `Esc` — Cancel active map tool / selection
