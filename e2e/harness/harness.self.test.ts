import { test, expect } from '@playwright/test';
import {
  startSupabaseProtocolServer,
  type ProtocolServerInfo,
  type SupabaseProtocolServer,
} from './supabaseProtocolServer.js';
import {
  assertSupabaseRejected,
  createAnonClient,
  createAuthenticatedUser,
  createServiceClient,
  provisionTestTrio,
  signInUser,
} from '../helpers/protocolAdmin.js';
import { createPngBuffer, makeInviteCode, makeUserCredentials } from '../fixtures/sampleData.js';
import { abortExternalFontRequests } from '../fixtures/e2eFixtures.js';

let server: SupabaseProtocolServer;
let info: ProtocolServerInfo;

test.describe('Harness Self-Tests (Protocol Server + Chromium WebGL2 + Sandbox)', () => {
  test.beforeAll(async () => {
    const started = await startSupabaseProtocolServer(0);
    server = started.server;
    info = started.info;
  });

  test.beforeEach(() => {
    server.reset();
  });

  test.afterAll(async () => {
    await server.stop();
  });

  test('1. Auth signup/signin/session/logout/invalid-login + auto profiles trigger', async () => {
    const creds = makeUserCredentials('authcheck');
    const client = createAnonClient(info.url, info.anonKey);

    // Signup auto-creates user + session + profiles row via trigger
    const signupRes = await client.auth.signUp({
      email: creds.email,
      password: creds.password,
      options: { data: { display_name: creds.displayName } },
    });
    expect(signupRes.error).toBeNull();
    expect(signupRes.data.user?.email).toBe(creds.email);
    expect(signupRes.data.session?.access_token).toBeTruthy();

    const userId = signupRes.data.user!.id;

    // Verify auto-created profile row via PostgREST (schema.sql: no email column on profiles)
    const profileRes = await client.from('profiles').select('*').eq('id', userId).single();
    expect(profileRes.error).toBeNull();
    expect(profileRes.data.id).toBe(userId);
    expect(profileRes.data.display_name).toBe(creds.displayName);
    expect(profileRes.data.bio).toBe('');
    expect('email' in profileRes.data).toBe(false);

    // Verify getUser returns authenticated user
    const getUserRes = await client.auth.getUser();
    expect(getUserRes.error).toBeNull();
    expect(getUserRes.data.user?.id).toBe(userId);

    // Logout revokes token on server
    const oldToken = signupRes.data.session!.access_token;
    const logoutRes = await client.auth.signOut();
    expect(logoutRes.error).toBeNull();

    const revokedCheck = await fetch(`${info.url}/auth/v1/user`, {
      headers: {
        apikey: info.anonKey,
        Authorization: `Bearer ${oldToken}`,
      },
    });
    expect(revokedCheck.status).toBe(401);

    // Invalid login fails cleanly
    const badLogin = await client.auth.signInWithPassword({
      email: creds.email,
      password: 'WrongPassword123!',
    });
    expect(badLogin.error).not.toBeNull();
    expect(badLogin.data.session).toBeNull();

    // Valid sign-in succeeds
    const goodLogin = await signInUser(info.url, info.anonKey, creds.email, creds.password);
    expect(goodLogin.userId).toBe(userId);
    expect(goodLogin.accessToken).toBeTruthy();
  });

  test('2. Campaigns, invite join, RLS visibility, co_gm protection & West Marches vs Normal char triggers', async () => {
    const { gm, playerA, playerB } = await provisionTestTrio(info.url, info.anonKey);
    const wmInvite = makeInviteCode('WM');
    const normInvite = makeInviteCode('NORM');

    // GM creates a West Marches campaign -> auto-added as 'gm'
    const wmCreate = await gm.client
      .from('worlds')
      .insert({ name: 'West Marches Reach', mode: 'west_marches', invite_code: wmInvite })
      .select()
      .single();
    expect(wmCreate.error).toBeNull();
    const wmId = wmCreate.data.id as string;

    const gmMemberCheck = await gm.client
      .from('campaign_members')
      .select('*')
      .eq('campaign_id', wmId)
      .eq('user_id', gm.userId)
      .single();
    expect(gmMemberCheck.error).toBeNull();
    expect(gmMemberCheck.data.role).toBe('gm');

    // Unjoined Player A & Player B cannot see the campaign
    const unjoinedWorlds = await playerA.client.from('worlds').select('*').eq('id', wmId);
    expect(unjoinedWorlds.error).toBeNull();
    expect(unjoinedWorlds.data).toEqual([]);

    // Player A joins via RPC join_campaign_by_invite
    const joinRes = await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: wmInvite });
    expect(joinRes.error).toBeNull();
    expect(joinRes.data).toBe(wmId);

    // Player A now sees the campaign, Player B still does not
    const playerASees = await playerA.client.from('worlds').select('*').eq('id', wmId).single();
    expect(playerASees.error).toBeNull();
    expect(playerASees.data.name).toBe('West Marches Reach');

    const playerBSees = await playerB.client.from('worlds').select('*').eq('id', wmId);
    expect(playerBSees.data).toEqual([]);

    // Non-GM Player A cannot self-promote or write GM-only entities/vault_assets/entity_templates/entity_links
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .update({ role: 'gm' })
        .eq('campaign_id', wmId)
        .eq('user_id', playerA.userId)
        .select(),
      'non-GM self-promotion',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('entities')
        .insert({ world_id: wmId, slug: 'rogue-edit', title: 'Rogue Edit', type: 'NPC' })
        .select(),
      'non-GM entity insert',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('vault_assets')
        .insert({ world_id: wmId, slug: 'rogue-asset', name: 'Rogue', url: 'https://example.test/a.png' })
        .select(),
      'non-GM vault_assets insert',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('entity_templates')
        .insert({ world_id: wmId, type: 'Custom', label: 'Rogue Template' })
        .select(),
      'non-GM entity_templates insert',
    );

    // GM inserts an entity -> Player A sees it with gm_secrets stripped
    const gmEntity = await gm.client
      .from('entities')
      .insert({
        world_id: wmId,
        slug: 'elder-vance',
        title: 'Elder Vance',
        type: 'NPC',
        gm_secrets: 'Actually a lich',
      })
      .select()
      .single();
    expect(gmEntity.error).toBeNull();

    const playerReadEntity = await playerA.client.from('entities').select('*').eq('id', gmEntity.data.id).single();
    expect(playerReadEntity.error).toBeNull();
    expect(playerReadEntity.data.title).toBe('Elder Vance');
    expect(playerReadEntity.data.gm_secrets).toBeNull();

    // GM creates sheet template in West Marches campaign
    const sheetTpl = await gm.client
      .from('character_sheet_templates')
      .insert({ campaign_id: wmId, name: '5e Adventurer' })
      .select()
      .single();
    expect(sheetTpl.error).toBeNull();

    // GM promotes Player A to co_gm; co_gm still cannot demote/kick primary GM, POST a 'gm' member, or hijack worlds.owner_id
    const promoteRes = await gm.client
      .from('campaign_members')
      .update({ role: 'co_gm' })
      .eq('campaign_id', wmId)
      .eq('user_id', playerA.userId)
      .select()
      .single();
    expect(promoteRes.error).toBeNull();
    expect(promoteRes.data.role).toBe('co_gm');

    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .update({ role: 'player' })
        .eq('campaign_id', wmId)
        .eq('user_id', gm.userId)
        .select(),
      'co_gm demote primary gm',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .delete()
        .eq('campaign_id', wmId)
        .eq('user_id', gm.userId)
        .select(),
      'co_gm kick primary gm',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .insert({ campaign_id: wmId, user_id: playerB.userId, role: 'gm' })
        .select(),
      'co_gm POST new gm row',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('worlds')
        .update({ owner_id: playerA.userId })
        .eq('id', wmId)
        .select(),
      'co_gm hijack worlds.owner_id',
    );

    // West Marches single active character trigger (SQLSTATE '23505') + sheet_template_id FK
    const char1 = await playerA.client
      .from('characters')
      .insert({
        campaign_id: wmId,
        user_id: playerA.userId,
        name: 'Kaelen',
        sheet_template_id: sheetTpl.data.id,
        is_active: true,
      })
      .select('*, character_sheet_templates(id, name)')
      .single();
    expect(char1.error).toBeNull();
    expect(char1.data.sheet_template_id).toBe(sheetTpl.data.id);
    expect(char1.data.character_sheet_templates?.name).toBe('5e Adventurer');

    const char2Err = await assertSupabaseRejected(
      playerA.client
        .from('characters')
        .insert({ campaign_id: wmId, user_id: playerA.userId, name: 'Second Active', is_active: true })
        .select(),
      '2nd active character in West Marches',
    );
    expect(char2Err.code).toBe('23505');

    // Inactive 2nd character is allowed in West Marches
    const char2Inactive = await playerA.client
      .from('characters')
      .insert({ campaign_id: wmId, user_id: playerA.userId, name: 'Retired Hero', is_active: false })
      .select()
      .single();
    expect(char2Inactive.error).toBeNull();

    // Normal mode allows multiple active characters
    const normalWorld = await gm.client
      .from('worlds')
      .insert({ name: 'Normal Saga', mode: 'normal', invite_code: normInvite })
      .select()
      .single();
    expect(normalWorld.error).toBeNull();
    const normId = normalWorld.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: normInvite });

    const normChar1 = await playerA.client
      .from('characters')
      .insert({ campaign_id: normId, user_id: playerA.userId, name: 'Hero One', is_active: true })
      .select()
      .single();
    const normChar2 = await playerA.client
      .from('characters')
      .insert({ campaign_id: normId, user_id: playerA.userId, name: 'Hero Two', is_active: true })
      .select()
      .single();
    expect(normChar1.error).toBeNull();
    expect(normChar2.error).toBeNull();

    // guard_world_west_marches_transition: switching normal -> west_marches fails ('23505') while playerA has >1 active char
    const transitionErr = await assertSupabaseRejected(
      gm.client.from('worlds').update({ mode: 'west_marches' }).eq('id', normId).select(),
      'normal -> west_marches with >1 active char',
    );
    expect(transitionErr.code).toBe('23505');

    // Once Hero Two is deactivated, switching normal -> west_marches succeeds
    const deactivate = await playerA.client
      .from('characters')
      .update({ is_active: false })
      .eq('id', normChar2.data.id)
      .select()
      .single();
    expect(deactivate.error).toBeNull();

    const transitionOk = await gm.client
      .from('worlds')
      .update({ mode: 'west_marches' })
      .eq('id', normId)
      .select()
      .single();
    expect(transitionOk.error).toBeNull();
    expect(transitionOk.data.mode).toBe('west_marches');
  });

  test('3. Concurrent Promise.all signup_for_guild_quest cap contention & withdraw_from_guild_quest reopening + status guard', async () => {
    const { gm, playerA, playerB } = await provisionTestTrio(info.url, info.anonKey);
    const guildInvite = makeInviteCode('GLD');

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Guild Frontier', mode: 'west_marches', invite_code: guildInvite })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: guildInvite });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: guildInvite });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Lyra', is_active: true })
      .select()
      .single();
    const charB = await playerB.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerB.userId, name: 'Torin', is_active: true })
      .select()
      .single();

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Harbor Overworld', kind: '3d' })
      .select()
      .single();
    expect(mapRow.error).toBeNull();

    // map_quest_boards requires map_id (NOT NULL)
    await assertSupabaseRejected(
      gm.client.from('map_quest_boards').insert({ campaign_id: cid, title: 'Missing Map Board' }).select(),
      'map_quest_boards missing map_id',
    );

    const board = await gm.client
      .from('map_quest_boards')
      .insert({ map_id: mapRow.data.id, campaign_id: cid, title: 'Harbor Board', x: 0, y: 0, z: 0 })
      .select()
      .single();
    expect(board.error).toBeNull();

    const quest = await gm.client
      .from('guild_quests')
      .insert({
        campaign_id: cid,
        board_id: board.data.id,
        title: 'Solo Scouting Run',
        summary: 'Reconnoiter the outer reef.',
        max_players: 1,
        status: 'open',
      })
      .select()
      .single();
    expect(quest.error).toBeNull();
    const qid = quest.data.id as string;

    // Direct player insert into guild_quest_signups is blocked by RLS (must use RPC)
    await assertSupabaseRejected(
      playerA.client
        .from('guild_quest_signups')
        .insert({ quest_id: qid, campaign_id: cid, user_id: playerA.userId, character_id: charA.data.id })
        .select(),
      'direct player insert into guild_quest_signups',
    );

    // Concurrent signup race for 1 slot
    const [resA, resB] = await Promise.all([
      playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: qid,
        p_character_id: charA.data.id,
        p_note: 'First!',
      }),
      playerB.client.rpc('signup_for_guild_quest', {
        p_quest_id: qid,
        p_character_id: charB.data.id,
        p_note: 'Second!',
      }),
    ]);

    const successes = [resA, resB].filter((r) => !r.error);
    const failures = [resA, resB].filter((r) => !!r.error);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // Verify signup row uses signed_up_at
    const signupRows = await gm.client.from('guild_quest_signups').select('*').eq('quest_id', qid);
    expect(signupRows.error).toBeNull();
    expect(signupRows.data).toHaveLength(1);
    expect(signupRows.data![0].signed_up_at).toBeTruthy();

    // Quest should now be marked 'full'
    const fullCheck = await gm.client.from('guild_quests').select('status').eq('id', qid).single();
    expect(fullCheck.data?.status).toBe('full');

    // Winner withdraws -> quest reopens to 'open'
    const winner = resA.error ? playerB : playerA;
    const loser = resA.error ? playerA : playerB;
    const loserCharId = resA.error ? charA.data.id : charB.data.id;

    const withdrawRes = await winner.client.rpc('withdraw_from_guild_quest', { p_quest_id: qid });
    expect(withdrawRes.error).toBeNull();

    const reopened = await gm.client.from('guild_quests').select('status').eq('id', qid).single();
    expect(reopened.data?.status).toBe('open');

    // Loser can now claim the reopened slot
    const claimRes = await loser.client.rpc('signup_for_guild_quest', {
      p_quest_id: qid,
      p_character_id: loserCharId,
      p_note: 'Claimed reopened slot',
    });
    expect(claimRes.error).toBeNull();

    // Non-GM withdraw blocked when quest is in_progress / completed / archived
    await gm.client.from('guild_quests').update({ status: 'in_progress' }).eq('id', qid);
    await assertSupabaseRejected(
      loser.client.rpc('withdraw_from_guild_quest', { p_quest_id: qid }),
      'non-GM withdraw during in_progress',
    );
  });

  test('4. Journal sharing/editor guard, Fog/Map/Pin RLS, move_my_battlemap_token RPC & Storage CORS', async ({
    browser,
  }) => {
    const { gm, playerA, playerB } = await provisionTestTrio(info.url, info.anonKey);
    const fogInvite = makeInviteCode('FOG');
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Fog & Lore', mode: 'west_marches', invite_code: fogInvite })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: fogInvite });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: fogInvite });

    // Journal: private (default share_scope) -> invisible to B and GM
    const privPage = await playerA.client
      .from('journal_pages')
      .insert({
        campaign_id: cid,
        owner_id: playerA.userId,
        title: 'Secret Diary',
        content: 'Hidden',
        share_scope: 'private',
      })
      .select()
      .single();
    expect(privPage.error).toBeNull();
    const pageId = privPage.data.id as string;

    expect((await playerB.client.from('journal_pages').select('*').eq('id', pageId)).data).toEqual([]);
    expect((await gm.client.from('journal_pages').select('*').eq('id', pageId)).data).toEqual([]);

    // Share with Player B read-only (share_scope='selected', composite PK (page_id, shared_with_user_id), no campaign_id/id)
    await playerA.client
      .from('journal_pages')
      .update({ share_scope: 'selected' })
      .eq('id', pageId)
      .select()
      .single();
    const shareRes = await playerA.client
      .from('journal_page_shares')
      .insert({
        page_id: pageId,
        shared_with_user_id: playerB.userId,
        can_edit: false,
      })
      .select()
      .single();
    expect(shareRes.error).toBeNull();

    // GM cannot snoop on journal_page_shares
    expect((await gm.client.from('journal_page_shares').select('*').eq('page_id', pageId)).data).toEqual([]);

    const bReads = await playerB.client.from('journal_pages').select('*').eq('id', pageId).single();
    expect(bReads.error).toBeNull();
    expect(bReads.data.title).toBe('Secret Diary');

    // Player B cannot edit when can_edit = false
    await assertSupabaseRejected(
      playerB.client.from('journal_pages').update({ content: 'Unauthorized' }).eq('id', pageId).select(),
      'journal update when can_edit=false',
    );

    // Upgrade share to can_edit = true via composite PK -> Player B can update content
    await playerA.client
      .from('journal_page_shares')
      .update({ can_edit: true })
      .eq('page_id', pageId)
      .eq('shared_with_user_id', playerB.userId)
      .select()
      .single();
    const bEdits = await playerB.client
      .from('journal_pages')
      .update({ content: 'Co-authored note' })
      .eq('id', pageId)
      .select()
      .single();
    expect(bEdits.error).toBeNull();
    expect(bEdits.data.content).toBe('Co-authored note');

    // guard_journal_page_editor_update: non-owner editor CANNOT change owner_id, campaign_id, or share_scope
    await assertSupabaseRejected(
      playerB.client
        .from('journal_pages')
        .update({ share_scope: 'campaign' })
        .eq('id', pageId)
        .select(),
      'journal editor share_scope hijack',
    );
    await assertSupabaseRejected(
      playerB.client
        .from('journal_pages')
        .update({ owner_id: playerB.userId })
        .eq('id', pageId)
        .select(),
      'journal editor owner_id hijack',
    );

    // Campaign share_scope allows GM to read too
    await playerA.client.from('journal_pages').update({ share_scope: 'campaign' }).eq('id', pageId);
    const gmReads = await gm.client.from('journal_pages').select('*').eq('id', pageId).single();
    expect(gmReads.error).toBeNull();

    // Maps (world_id, battlemap), Map Pins & Map Paths (via map_id -> maps.world_id)
    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: cid,
        name: '3D Overworld',
        kind: '3d',
        battlemap: {
          tokens: [
            { id: 'tok-a', name: 'Lyra Token', owner_user_id: playerA.userId, x: 1, y: 1, isHidden: false },
            { id: 'tok-hidden', name: 'Hidden Token', owner_user_id: playerA.userId, x: 2, y: 2, isHidden: true },
            { id: 'tok-b', name: 'Torin Token', owner_user_id: playerB.userId, x: 3, y: 3, isHidden: false },
          ],
        },
      })
      .select()
      .single();
    expect(mapRow.error).toBeNull();
    const mapId = mapRow.data.id as string;

    // map_pins & map_paths RLS via map_id -> maps.world_id
    await assertSupabaseRejected(
      playerA.client.from('map_pins').insert({ map_id: mapId, label: 'Rogue Pin', x: 0, y: 0, z: 0 }).select(),
      'non-GM map_pins insert',
    );
    const gmSecretPin = await gm.client
      .from('map_pins')
      .insert({ map_id: mapId, label: 'Secret Lair', x: 5, y: 1, z: 5, is_gm_only: true })
      .select()
      .single();
    expect(gmSecretPin.error).toBeNull();
    expect((await playerA.client.from('map_pins').select('*').eq('map_id', mapId)).data).toEqual([]);

    const gmPath = await gm.client
      .from('map_paths')
      .insert({ map_id: mapId, name: 'King Road', points: [[0, 0, 0], [10, 0, 10]], style: 'dashed-gold' })
      .select()
      .single();
    expect(gmPath.error).toBeNull();

    // move_my_battlemap_token RPC
    const moveOwnOk = await playerA.client.rpc('move_my_battlemap_token', {
      p_map_id: mapId,
      p_token_id: 'tok-a',
      p_x: 12,
      p_y: 8,
    });
    expect(moveOwnOk.error).toBeNull();

    await assertSupabaseRejected(
      playerA.client.rpc('move_my_battlemap_token', {
        p_map_id: mapId,
        p_token_id: 'tok-b',
        p_x: 9,
        p_y: 9,
      }),
      'playerA moving playerB token',
    );
    await assertSupabaseRejected(
      playerA.client.rpc('move_my_battlemap_token', {
        p_map_id: mapId,
        p_token_id: 'tok-hidden',
        p_x: 9,
        p_y: 9,
      }),
      'playerA moving hidden token',
    );
    const gmMoveHidden = await gm.client.rpc('move_my_battlemap_token', {
      p_map_id: mapId,
      p_token_id: 'tok-hidden',
      p_x: 4,
      p_y: 6,
    });
    expect(gmMoveHidden.error).toBeNull();

    const updatedMap = await gm.client.from('maps').select('battlemap').eq('id', mapId).single();
    const tokens = (updatedMap.data?.battlemap as { tokens: Array<{ id: string; x: number; y: number }> }).tokens;
    expect(tokens.find((t) => t.id === 'tok-a')).toMatchObject({ x: 12, y: 8 });
    expect(tokens.find((t) => t.id === 'tok-hidden')).toMatchObject({ x: 4, y: 6 });

    // Fog sharing RLS (composite PK (map_id, user_id), no is_baseline column, GM-only insert/update)
    await assertSupabaseRejected(
      playerA.client
        .from('map_fog_states')
        .insert({
          campaign_id: cid,
          map_id: mapId,
          user_id: playerA.userId,
          mask_url: `${info.url}/storage/v1/object/public/vault-assets/fog-a.png`,
        })
        .select(),
      'non-GM map_fog_states insert',
    );

    const fogA = await gm.client
      .from('map_fog_states')
      .insert({
        campaign_id: cid,
        map_id: mapId,
        user_id: playerA.userId,
        mask_url: `${info.url}/storage/v1/object/public/vault-assets/fog-a.png`,
      })
      .select()
      .single();
    expect(fogA.error).toBeNull();

    // Initially Player B cannot read Player A's fog state
    expect((await playerB.client.from('map_fog_states').select('*').eq('user_id', playerA.userId)).data).toEqual([]);

    // Player A shares fog with Player B
    const fogShare = await playerA.client
      .from('map_fog_shares')
      .insert({
        campaign_id: cid,
        map_id: mapId,
        owner_user_id: playerA.userId,
        shared_with_user_id: playerB.userId,
        share_all: false,
      })
      .select()
      .single();
    expect(fogShare.error).toBeNull();

    const bSeesFogA = await playerB.client
      .from('map_fog_states')
      .select('*')
      .eq('map_id', mapId)
      .eq('user_id', playerA.userId)
      .single();
    expect(bSeesFogA.error).toBeNull();

    // Storage upload (unauthenticated blocked, authenticated succeeds)
    const anonClient = createAnonClient(info.url, info.anonKey);
    const pngBytes = createPngBuffer(16, 16, [42, 180, 99, 255]);
    const anonUpload = await anonClient.storage
      .from('vault-assets')
      .upload('test/blocked.png', pngBytes, { contentType: 'image/png' });
    expect(anonUpload.error).not.toBeNull();

    const authUpload = await playerA.client.storage
      .from('vault-assets')
      .upload(`fog/${cid}/mask-a.png`, new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }), {
        contentType: 'image/png',
        upsert: true,
      });
    expect(authUpload.error).toBeNull();

    const { data: pubUrlData } = playerA.client.storage
      .from('vault-assets')
      .getPublicUrl(`fog/${cid}/mask-a.png`);

    // Verify cross-origin browser fetch + canvas getImageData() without tainting
    const ctx = await browser.newContext();
    await abortExternalFontRequests(ctx);
    const page = await ctx.newPage();
    try {
      await page.setContent('<!doctype html><html><body><canvas id="c" width="16" height="16"></canvas></body></html>');
      const pixel = await page.evaluate(async (assetUrl: string) => {
        const resp = await fetch(assetUrl);
        if (!resp.ok) throw new Error(`Storage fetch failed: ${resp.status}`);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = assetUrl;
        });
        const canvas = document.getElementById('c') as HTMLCanvasElement;
        const c2d = canvas.getContext('2d')!;
        c2d.drawImage(img, 0, 0);
        const data = c2d.getImageData(0, 0, 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      }, pubUrlData.publicUrl);
      expect(pixel).toEqual([42, 180, 99, 255]);
    } finally {
      await ctx.close();
    }
  });

  test('5. Realtime WebSocket postgres_changes (with RLS filtering) & broadcast across two clients + blind roll guard', async () => {
    const { gm, playerA } = await provisionTestTrio(info.url, info.anonKey);
    const liveInvite = makeInviteCode('LIVE');
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Realtime Hall', mode: 'normal', invite_code: liveInvite })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: liveInvite });

    const serviceClient = createServiceClient(info.url, info.serviceRoleKey);
    void serviceClient;

    // Non-GM Player A cannot insert a blind GM roll (schema.sql:1807)
    await assertSupabaseRejected(
      playerA.client
        .from('dice_rolls')
        .insert({
          campaign_id: cid,
          user_id: playerA.userId,
          label: 'Fake Blind Roll',
          expression: '1d20',
          total: 20,
          is_gm_blind: true,
        })
        .select(),
      'non-GM is_gm_blind dice_rolls insert',
    );

    const playerReceivedRolls: Array<Record<string, unknown>> = [];
    const gmReceivedRolls: Array<Record<string, unknown>> = [];
    const playerBroadcasts: Array<Record<string, unknown>> = [];

    const playerChannel = playerA.client
      .channel(`campaign:${cid}:player`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_rolls', filter: `campaign_id=eq.${cid}` },
        (payload) => {
          playerReceivedRolls.push(payload.new as Record<string, unknown>);
        },
      )
      .on('broadcast', { event: 'ping-cursor' }, (msg) => {
        playerBroadcasts.push(msg.payload as Record<string, unknown>);
      });

    const gmChannel = gm.client
      .channel(`campaign:${cid}:gm`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_rolls', filter: `campaign_id=eq.${cid}` },
        (payload) => {
          gmReceivedRolls.push(payload.new as Record<string, unknown>);
        },
      );

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        playerChannel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') resolve();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
        });
      }),
      new Promise<void>((resolve, reject) => {
        gmChannel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') resolve();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
        });
      }),
    ]);

    // Also join shared broadcast topic for GM -> Player broadcast
    const gmBroadcastCh = gm.client.channel(`room:${cid}`);
    const playerBroadcastCh = playerA.client.channel(`room:${cid}`);
    playerBroadcastCh.on('broadcast', { event: 'ping-cursor' }, (msg) => {
      playerBroadcasts.push(msg.payload as Record<string, unknown>);
    });
    await Promise.all([
      new Promise<void>((resolve) => gmBroadcastCh.subscribe((s) => s === 'SUBSCRIBED' && resolve())),
      new Promise<void>((resolve) => playerBroadcastCh.subscribe((s) => s === 'SUBSCRIBED' && resolve())),
    ]);

    // Public dice roll -> delivered to both GM and Player A
    await gm.client.from('dice_rolls').insert({
      campaign_id: cid,
      user_id: gm.userId,
      label: 'Public Initiative',
      expression: '1d20+2',
      total: 19,
      is_gm_blind: false,
    });

    // Blind GM roll -> delivered to GM only, filtered from Player A by RLS
    await gm.client.from('dice_rolls').insert({
      campaign_id: cid,
      user_id: gm.userId,
      label: 'Blind Stealth Check',
      expression: '1d20+7',
      total: 24,
      is_gm_blind: true,
    });

    // Broadcast from GM to Player A
    await gmBroadcastCh.send({
      type: 'broadcast',
      event: 'ping-cursor',
      payload: { x: 120, y: 340 },
    });

    await expect.poll(() => gmReceivedRolls.length).toBe(2);
    await expect.poll(() => playerBroadcasts.length).toBe(1);
    expect(playerBroadcasts[0]).toEqual({ x: 120, y: 340 });

    // Give any stray event a brief window, then verify Player A received ONLY the public roll
    await new Promise((r) => setTimeout(r, 150));
    expect(playerReceivedRolls).toHaveLength(1);
    expect(playerReceivedRolls[0].label).toBe('Public Initiative');

    await gm.client.removeAllChannels();
    await playerA.client.removeAllChannels();
  });

  test('6. Chromium SwiftShader WebGL2 context + <iframe sandbox="allow-scripts"> isolation & postMessage bridge', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await abortExternalFontRequests(ctx);
    const page = await ctx.newPage();

    try {
      await page.route('http://sandbox-host.local/test', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html>
<html>
<body>
  <canvas id="gl" width="128" height="128"></canvas>
  <div id="parent-secret">GM_SECRET_TOKEN</div>
  <iframe id="sheet-frame" sandbox="allow-scripts"></iframe>
  <script>
    window.localStorage.setItem('parent_sensitive_key', 'DO_NOT_READ');
    window.__receivedFromIframe = [];
    window.addEventListener('message', (ev) => {
      const iframe = document.getElementById('sheet-frame');
      if (ev.source === iframe.contentWindow) {
        window.__receivedFromIframe.push(ev.data);
      }
    });
  </script>
</body>
</html>`,
        });
      });
      await page.goto('http://sandbox-host.local/test');

      // Check WebGL2 creation under ANGLE/SwiftShader
      const webglInfo = await page.evaluate(() => {
        const canvas = document.getElementById('gl') as HTMLCanvasElement;
        const gl = canvas.getContext('webgl2');
        if (!gl) return { ok: false, reason: 'webgl2 context is null' };
        gl.clearColor(0.25, 0.5, 0.75, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return {
          ok: true,
          version: gl.getParameter(gl.VERSION),
          renderer: gl.getParameter(gl.RENDERER),
          pixel: Array.from(px),
        };
      });

      expect(webglInfo.ok).toBe(true);
      expect(String(webglInfo.version)).toContain('WebGL 2.0');
      expect(webglInfo.pixel?.[0]).toBeGreaterThan(50);
      expect(webglInfo.pixel?.[2]).toBeGreaterThan(170);

      // Load sandboxed iframe without allow-same-origin and test isolation + postMessage bridge
      await page.evaluate(() => {
        const iframe = document.getElementById('sheet-frame') as HTMLIFrameElement;
        iframe.srcdoc = `<!doctype html><html><body>
          <button id="roll-btn">Roll [[1d20+5]]</button>
          <script>
            let parentDomBlocked = false;
            let localStorageBlocked = false;
            try {
              const txt = window.parent.document.getElementById('parent-secret')?.textContent;
              if (!txt) parentDomBlocked = true;
            } catch (e) {
              parentDomBlocked = true;
            }
            try {
              const val = window.localStorage.getItem('parent_sensitive_key');
              if (val === null) localStorageBlocked = true;
            } catch (e) {
              localStorageBlocked = true;
            }
            window.parent.postMessage({
              type: 'SANDBOX_PROBE',
              parentDomBlocked,
              localStorageBlocked
            }, '*');
            document.getElementById('roll-btn').addEventListener('click', () => {
              window.parent.postMessage({
                type: 'SHEET_ROLL',
                instanceId: 'inst-1',
                label: 'Attack',
                expression: '1d20+5'
              }, '*');
            });
          </script>
        </body></html>`;
      });

      await page.waitForFunction(() => (window as unknown as { __receivedFromIframe: unknown[] }).__receivedFromIframe.length >= 1);
      const frameLoc = page.frameLocator('#sheet-frame');
      await frameLoc.locator('#roll-btn').click();
      await page.waitForFunction(() => (window as unknown as { __receivedFromIframe: unknown[] }).__receivedFromIframe.length >= 2);

      const messages = await page.evaluate(
        () => (window as unknown as { __receivedFromIframe: Array<Record<string, unknown>> }).__receivedFromIframe,
      );
      expect(messages[0]).toEqual({
        type: 'SANDBOX_PROBE',
        parentDomBlocked: true,
        localStorageBlocked: true,
      });
      expect(
        await page.evaluate(() => window.localStorage.getItem('parent_sensitive_key')),
      ).toBe('DO_NOT_READ');
      expect(messages[1]).toEqual({
        type: 'SHEET_ROLL',
        instanceId: 'inst-1',
        label: 'Attack',
        expression: '1d20+5',
      });
    } finally {
      await ctx.close();
    }
  });
});
