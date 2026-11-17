import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const schemaPath = path.resolve(__dirname, '../../../supabase/schema.sql');
const rawSql = fs.readFileSync(schemaPath, 'utf8');
const sql = rawSql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const ALL_PUBLIC_TABLES = [
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
  'timeline_events',
] as const;

const REALTIME_TABLES = [
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
  'timeline_events',
] as const;

function extractSection(startMarker: RegExp, endMarker: RegExp): string {
  const startMatch = sql.match(startMarker);
  if (!startMatch || startMatch.index === undefined) return '';
  const afterStart = sql.slice(startMatch.index);
  const endMatch = afterStart.slice(startMatch[0].length).match(endMarker);
  if (!endMatch || endMatch.index === undefined) return afterStart;
  return afterStart.slice(0, startMatch[0].length + endMatch.index);
}

describe('supabase/schema.sql sanity checks', () => {
  it('removes legacy vault token probe artifacts and never recreates them', () => {
    expect(sql).not.toMatch(/x-vault-token/i);
    expect(sql).not.toMatch(/create\s+table\b[\s\S]*?\bvault_probe\b/i);
    expect(sql).not.toMatch(/create\s+table\b[\s\S]*?\bvault_credentials\b/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\b[\s\S]*?\bhas_valid_vault_token\b/i);
    expect(sql).not.toMatch(/create\s+schema\b[\s\S]*?\bprivate\b/i);

    expect(sql).toMatch(/drop\s+table\s+if\s+exists\s+public\.vault_probe\s+cascade/i);
    expect(sql).toMatch(/drop\s+table\s+if\s+exists\s+private\.vault_credentials\s+cascade/i);
    expect(sql).toMatch(/drop\s+function\s+if\s+exists\s+private\.has_valid_vault_token\(\)\s+cascade/i);
    expect(sql).toMatch(/drop\s+schema\s+if\s+exists\s+private\s+cascade/i);
  });

  it('never grants privileges or creates RLS policies for anon', () => {
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\banon\b/i);
    expect(sql).not.toMatch(/\bcreate\s+policy\b[^;]*\bto\b[^;]*\banon\b/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.%I\s+from\s+public,\s*anon/i);
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+table\s+public\.%I\s+to\s+authenticated/i);
  });

  it('defines all 21 public tables and enables RLS on every one of them', () => {
    expect(ALL_PUBLIC_TABLES).toHaveLength(21);

    for (const table of ALL_PUBLIC_TABLES) {
      const createTableRegex = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'i');
      expect(sql, `Missing CREATE TABLE for public.${table}`).toMatch(createTableRegex);

      const directAlterRls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i');
      const loopIncludesTable = new RegExp(`'${table}'[\\s\\S]*enable\\s+row\\s+level\\s+security`, 'i');
      expect(
        directAlterRls.test(sql) || loopIncludesTable.test(sql),
        `RLS must be enabled on public.${table}`,
      ).toBe(true);
    }
  });

  it('defines required worlds extensions, maps columns, and ON DELETE SET NULL foreign keys', () => {
    const worldsSql = extractSection(/create\s+table\s+if\s+not\s+exists\s+public\.worlds\b/i, /create\s+table\s+if\s+not\s+exists\s+public\.campaign_members\b/i);
    expect(worldsSql).toMatch(/\bowner_id\s+uuid\s+references\s+auth\.users\(id\)\s+on\s+delete\s+set\s+null/i);
    expect(worldsSql).toMatch(/\bmode\s+text\s+not\s+null\s+default\s+'normal'/i);
    expect(worldsSql).toMatch(/check\s*\(\s*mode\s+in\s*\(\s*'normal'\s*,\s*'west_marches'\s*\)\s*\)/i);
    expect(worldsSql).toMatch(/\binvite_code\s+text/i);
    expect(worldsSql).toMatch(/\bmax_players_per_party\s+integer\s+not\s+null\s+default\s+5/i);
    expect(worldsSql).toMatch(/\bcalendar_config\s+jsonb\b/i);
    expect(worldsSql).toMatch(/\bactive_sheet_template_id\s+uuid\b/i);

    expect(sql).toMatch(/foreign\s+key\s*\(\s*active_sheet_template_id\s*\)\s*references\s+public\.character_sheet_templates\(id\)\s+on\s+delete\s+set\s+null/i);

    const mapsSql = extractSection(/create\s+table\s+if\s+not\s+exists\s+public\.maps\b/i, /create\s+table\s+if\s+not\s+exists\s+public\.map_pins\b/i);
    for (const col of [
      'world_size',
      'sea_level',
      'paint_url',
      'water',
      'terrain_shading',
      'fog_volumes',
      'fog_of_war_2d',
      'combat_state',
      'layers',
      'zones',
      'labels',
    ]) {
      expect(mapsSql, `Missing maps column ${col}`).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
    expect(mapsSql).not.toMatch(/\bwater\s+jsonb\s+not\s+null/i);
    expect(mapsSql).not.toMatch(/\bwater\s+jsonb\s+default/i);
    expect(mapsSql).not.toMatch(/\bterrain_shading\s+jsonb\s+not\s+null/i);
    expect(mapsSql).not.toMatch(/\bterrain_shading\s+jsonb\s+default/i);

    // Optional reference FKs use ON DELETE SET NULL
    expect(sql).toMatch(/\bentity_id\s+uuid\s+references\s+public\.entities\(id\)\s+on\s+delete\s+set\s+null/i);
    expect(sql).toMatch(/\bsheet_template_id\s+uuid\s+references\s+public\.character_sheet_templates\(id\)\s+on\s+delete\s+set\s+null/i);
    expect(sql).toMatch(/\blinked_entity_id\s+uuid\s+references\s+public\.entities\(id\)\s+on\s+delete\s+set\s+null/i);
    expect(sql).toMatch(/\bcharacter_id\s+uuid\s+references\s+public\.characters\(id\)\s+on\s+delete\s+set\s+null/i);
    expect(sql).toMatch(/\bupdated_by\s+uuid\s+references\s+auth\.users\(id\)\s+on\s+delete\s+set\s+null/i);
    expect(sql).toMatch(/\bcreated_by\s+uuid\s+references\s+auth\.users\(id\)\s+on\s+delete\s+set\s+null/i);
  });

  it('enforces West Marches single active character via trigger rather than unconditional unique index', () => {
    expect(sql).not.toMatch(/create\s+unique\s+index[^;]*\bon\s+public\.characters\b/i);
    expect(sql).toMatch(/create\s+index\s+if\s+not\s+exists\s+idx_characters_campaign_user_active\s+on\s+public\.characters\s*\(\s*campaign_id\s*,\s*user_id\s*\)\s*where\s+is_active\s*=\s*true/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.enforce_west_marches_single_active_char\(\)/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/v_mode\s*=\s*'west_marches'/i);
    expect(sql).toMatch(/errcode\s*=\s*'23505'/i);
    expect(sql).toMatch(/before\s+insert\s+or\s+update\s+on\s+public\.characters/i);
  });

  it('defines all required triggers, security-definer helpers, and RPCs with execute grants', () => {
    const requiredFunctions = [
      'handle_new_user',
      'handle_world_created',
      'guard_world_owner_change',
      'guard_world_west_marches_transition',
      'is_campaign_member',
      'is_campaign_gm',
      'is_campaign_primary_gm',
      'join_campaign_by_invite',
      'enforce_west_marches_single_active_char',
      'signup_for_guild_quest',
      'withdraw_from_guild_quest',
      'handle_guild_quest_signup_deleted',
      'is_journal_page_owner',
      'is_user_in_journal_page_campaign',
      'guard_journal_page_editor_update',
      'move_my_battlemap_token',
    ];

    for (const fn of requiredFunctions) {
      expect(sql, `Missing function public.${fn}`).toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i'),
      );
    }

    expect(sql).toMatch(/create\s+trigger\s+on_auth_user_created\s+after\s+insert\s+on\s+auth\.users/i);
    expect(sql).toMatch(/create\s+trigger\s+on_world_created\s+after\s+insert\s+on\s+public\.worlds/i);
    expect(sql).toMatch(/create\s+trigger\s+guard_world_owner_change\s+before\s+update\s+on\s+public\.worlds/i);
    expect(sql).toMatch(/create\s+trigger\s+guard_world_west_marches_transition\s+before\s+update\s+of\s+mode\s+on\s+public\.worlds/i);
    expect(sql).toMatch(/create\s+trigger\s+trg_guild_quest_signup_deleted\s+after\s+delete\s+on\s+public\.guild_quest_signups/i);
    expect(sql).toMatch(/create\s+trigger\s+guard_journal_page_editor_update\s+before\s+update\s+on\s+public\.journal_pages/i);

    const signupSql = extractSection(/create\s+or\s+replace\s+function\s+public\.signup_for_guild_quest/i, /create\s+or\s+replace\s+function\s+public\.withdraw_from_guild_quest/i);
    expect(signupSql).toMatch(/for\s+update/i);
    expect(signupSql).toMatch(/status\s*=\s*'full'/i);

    const withdrawSql = extractSection(/create\s+or\s+replace\s+function\s+public\.withdraw_from_guild_quest/i, /create\s+or\s+replace\s+function\s+public\.handle_guild_quest_signup_deleted/i);
    expect(withdrawSql).toMatch(/in\s*\(\s*'in_progress'\s*,\s*'completed'\s*,\s*'archived'\s*\)/i);
    expect(withdrawSql).toMatch(/status\s*=\s*'open'/i);

    const moveTokenSql = extractSection(/create\s+or\s+replace\s+function\s+public\.move_my_battlemap_token/i, /do\s+\$\$/i);
    expect(moveTokenSql).toMatch(/p_token_id\s+is\s+null/i);
    expect(moveTokenSql).toMatch(/p_x\s+is\s+null/i);
    expect(moveTokenSql).toMatch(/p_y\s+is\s+null/i);
    expect(moveTokenSql).toMatch(/'NaN'::numeric/i);
    expect(moveTokenSql).toMatch(/'Infinity'::numeric/i);
    expect(moveTokenSql).toMatch(/'-Infinity'::numeric/i);
    expect(moveTokenSql).toMatch(/not\s+v_is_gm[\s\S]*isHidden/i);

    expect(sql).toMatch(/revoke\s+all\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public,\s*anon\s*;/i);

    const grantExecuteSection = extractSection(/grant\s+execute\s+on\s+function/i, /to\s+authenticated\s*;/i);
    expect(grantExecuteSection).not.toBe('');
    for (const rpc of [
      'is_campaign_member',
      'is_campaign_gm',
      'is_campaign_primary_gm',
      'is_journal_page_owner',
      'is_user_in_journal_page_campaign',
      'join_campaign_by_invite',
      'signup_for_guild_quest',
      'withdraw_from_guild_quest',
      'move_my_battlemap_token',
    ]) {
      expect(grantExecuteSection, `Missing grant execute for public.${rpc}`).toMatch(
        new RegExp(`public\\.${rpc}\\s*\\([^)]*\\)`, 'i'),
      );
    }

    for (const triggerFn of [
      'handle_new_user',
      'handle_world_created',
      'guard_world_owner_change',
      'guard_world_west_marches_transition',
      'enforce_west_marches_single_active_char',
      'handle_guild_quest_signup_deleted',
      'guard_journal_page_editor_update',
    ]) {
      expect(grantExecuteSection, `Trigger function public.${triggerFn} should not be granted to authenticated`).not.toMatch(
        new RegExp(`public\\.${triggerFn}\\b`, 'i'),
      );
    }
  });

  it('enforces strict journal privacy and is_gm_only / is_gm_blind RLS filters', () => {
    const journalPolicies = extractSection(/create\s+policy\s+"journal_pages_select_shared"/i, /create\s+policy\s+"journal_page_shares_select_visible"/i);
    expect(journalPolicies).not.toMatch(/is_campaign_gm/i);

    const journalSharePolicies = extractSection(/create\s+policy\s+"journal_page_shares_select_visible"/i, /create\s+policy\s+"map_fog_states_select_shared"/i);
    expect(journalSharePolicies).toMatch(/is_user_in_journal_page_campaign\s*\(\s*page_id\s*,\s*shared_with_user_id\s*\)/i);

    const mapPinsSelect = extractSection(/create\s+policy\s+"map_pins_select_visible"/i, /create\s+policy\s+"map_pins_insert_gm"/i);
    expect(mapPinsSelect).toMatch(/not\s+is_gm_only/i);

    const mapPathsSelect = extractSection(/create\s+policy\s+"map_paths_select_visible"/i, /create\s+policy\s+"map_paths_insert_gm"/i);
    expect(mapPathsSelect).toMatch(/not\s+is_gm_only/i);

    const timelineSelect = extractSection(/create\s+policy\s+"timeline_events_select_visible"/i, /create\s+policy\s+"timeline_events_insert_gm"/i);
    expect(timelineSelect).toMatch(/not\s+is_gm_only/i);

    const diceSelect = extractSection(/create\s+policy\s+"dice_rolls_select_visible"/i, /create\s+policy\s+"dice_rolls_insert_member"/i);
    expect(diceSelect).toMatch(/not\s+is_gm_blind/i);

    const fogSelect = extractSection(/create\s+policy\s+"map_fog_states_select_shared"/i, /create\s+policy\s+"map_fog_states_insert_gm"/i);
    expect(fogSelect).toMatch(/map_fog_shares/i);
    expect(fogSelect).toMatch(/s\.campaign_id\s*=\s*map_fog_states\.campaign_id/i);
    expect(fogSelect).toMatch(/share_all\s*=\s*true/i);

    const fogInsert = extractSection(/create\s+policy\s+"map_fog_states_insert_gm"/i, /create\s+policy\s+"map_fog_states_update_gm"/i);
    expect(fogInsert).toMatch(/m\.id\s*=\s*map_id\s+and\s+m\.world_id\s*=\s*campaign_id/i);
    expect(fogInsert).toMatch(/cm\.campaign_id\s*=\s*map_fog_states\.campaign_id\s+and\s+cm\.user_id\s*=\s*map_fog_states\.user_id/i);

    const fogShareInsert = extractSection(/create\s+policy\s+"map_fog_shares_insert_owner_or_gm"/i, /create\s+policy\s+"map_fog_shares_update_owner_or_gm"/i);
    expect(fogShareInsert).toMatch(/m\.id\s*=\s*map_id\s+and\s+m\.world_id\s*=\s*campaign_id/i);
    expect(fogShareInsert).toMatch(/cm\.user_id\s*=\s*map_fog_shares\.owner_user_id/i);
    expect(fogShareInsert).toMatch(/cm\.user_id\s*=\s*map_fog_shares\.shared_with_user_id/i);
  });

  it('protects campaign ownership, co_gm privilege boundaries, and quest signup withdrawal status', () => {
    const worldsDelete = extractSection(/create\s+policy\s+"worlds_delete_owner"/i, /create\s+policy\s+"campaign_members_select_member"/i);
    expect(worldsDelete).toMatch(/owner_id\s*=\s*auth\.uid\(\)/i);
    expect(worldsDelete).not.toMatch(/is_campaign_gm/i);
    expect(sql).not.toMatch(/create\s+policy\s+"worlds_delete_owner_or_gm"/i);

    const membersPolicies = extractSection(/create\s+policy\s+"campaign_members_insert_gm"/i, /create\s+policy\s+"entities_select_member"/i);
    expect(membersPolicies).toMatch(/is_campaign_primary_gm/i);
    expect(membersPolicies).toMatch(/w\.owner_id\s*=\s*campaign_members\.user_id/i);

    const questSignupDelete = extractSection(/create\s+policy\s+"guild_quest_signups_delete_owner_or_gm"/i, /create\s+policy\s+"journal_pages_select_shared"/i);
    expect(questSignupDelete).toMatch(/q\.status\s+in\s*\(\s*'open'\s*,\s*'full'\s*\)/i);
  });

  it('registers campaign tables in supabase_realtime and configures vault-assets storage policies', () => {
    const realtimeSection = extractSection(/pg_publication[\s\S]*supabase_realtime/i, /insert\s+into\s+storage\.buckets/i);
    for (const table of REALTIME_TABLES) {
      expect(realtimeSection, `Missing ${table} in supabase_realtime publication`).toMatch(
        new RegExp(`'${table}'`, 'i'),
      );
    }

    const storageSection = extractSection(/insert\s+into\s+storage\.buckets/i, /$/);
    expect(storageSection).toMatch(/values\s*\(\s*'vault-assets'\s*,\s*'vault-assets'\s*,\s*true\s*\)/i);
    expect(storageSection).toMatch(/for\s+select[\s\S]*bucket_id\s*=\s*'vault-assets'/i);
    expect(storageSection).toMatch(/for\s+insert\s+to\s+authenticated[\s\S]*bucket_id\s*=\s*'vault-assets'\s+and\s+auth\.role\(\)\s*=\s*'authenticated'/i);
    expect(storageSection).toMatch(/for\s+update\s+to\s+authenticated[\s\S]*bucket_id\s*=\s*'vault-assets'\s+and\s+auth\.role\(\)\s*=\s*'authenticated'/i);
    expect(storageSection).toMatch(/for\s+delete\s+to\s+authenticated[\s\S]*bucket_id\s*=\s*'vault-assets'\s+and\s+auth\.role\(\)\s*=\s*'authenticated'/i);
  });
});
