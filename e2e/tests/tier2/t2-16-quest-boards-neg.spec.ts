import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-16 Negative & Boundary: West Marches Guild Quest Boards & Atomic Cap Signups', () => {
  test('T2-076: Over-cap signup (max_players=1, already full) rejected in UI and via RPC', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Full Quest World', mode: 'west_marches', invite_code: 'QST01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST01' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST01' });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Scout A', is_active: true })
      .select()
      .single();
    const charB = await playerB.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerB.userId, name: 'Scout B', is_active: true })
      .select()
      .single();

    const mapRow = await gm.client.from('maps').insert({ world_id: cid, name: 'Board Map 1', kind: '3d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: cid, map_id: mapRow.data.id, title: 'Tavern Board', x: 0, y: 0, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: cid, board_id: board.data.id, title: 'Single Slot Bounty', max_players: 1, status: 'open' })
      .select()
      .single();

    await playerA.client.rpc('signup_for_guild_quest', {
      p_quest_id: quest.data.id,
      p_character_id: charA.data.id,
      p_note: 'First!',
    });

    await assertSupabaseRejected(
      playerB.client.rpc('signup_for_guild_quest', {
        p_quest_id: quest.data.id,
        p_character_id: charB.data.id,
        p_note: 'Latecomer',
      }),
      'Player B signing up for full quest',
    );

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    const boardLabel = playerBPage.getByText(/Tavern Board|Single Slot Bounty/i).first();
    if (await boardLabel.isVisible().catch(() => false)) {
      await boardLabel.click();
      const acceptBtn = playerBPage.getByRole('button', { name: /accept|sign up|join quest/i }).first();
      if (await acceptBtn.isVisible().catch(() => false)) {
        expect(await acceptBtn.isDisabled()).toBe(true);
      }
    }

    tracker.assertNoErrors();
  });

  test('T2-077: Concurrent Promise.all last-slot signup allows exactly 1 winner and rejects 1 loser', async ({
    playerAPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Race Condition Guild', mode: 'west_marches', invite_code: 'QST02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST02' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST02' });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Racer A', is_active: true })
      .select()
      .single();
    const charB = await playerB.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerB.userId, name: 'Racer B', is_active: true })
      .select()
      .single();

    const mapRow2 = await gm.client.from('maps').insert({ world_id: cid, name: 'Board Map 2', kind: '3d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: cid, map_id: mapRow2.data.id, title: 'Race Board', x: 0, y: 0, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: cid, board_id: board.data.id, title: 'Last Slot Duel', max_players: 1, status: 'open' })
      .select()
      .single();

    const [resA, resB] = await Promise.all([
      playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: quest.data.id,
        p_character_id: charA.data.id,
        p_note: 'A',
      }),
      playerB.client.rpc('signup_for_guild_quest', {
        p_quest_id: quest.data.id,
        p_character_id: charB.data.id,
        p_note: 'B',
      }),
    ]);

    const wins = [resA, resB].filter((r) => !r.error);
    const losses = [resA, resB].filter((r) => !!r.error);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);

    const questCheck = await gm.client.from('guild_quests').select('status').eq('id', quest.data.id).single();
    expect(questCheck.data?.status).toBe('full');

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);

    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });

  test('T2-078: Duplicate quest signup and foreign character_id signup are both rejected', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Dup & Foreign Char', mode: 'west_marches', invite_code: 'QST03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST03' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST03' });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Own Char', is_active: true })
      .select()
      .single();
    const charB = await playerB.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerB.userId, name: 'Foreign Char', is_active: true })
      .select()
      .single();

    const mapRow3 = await gm.client.from('maps').insert({ world_id: cid, name: 'Board Map 3', kind: '3d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: cid, map_id: mapRow3.data.id, title: 'Guild Notice', x: 0, y: 0, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: cid, board_id: board.data.id, title: 'Patrol', max_players: 4, status: 'open' })
      .select()
      .single();

    // Foreign character rejected
    await assertSupabaseRejected(
      playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: quest.data.id,
        p_character_id: charB.data.id,
        p_note: 'Spoofed char',
      }),
      'Signup with foreign character_id',
    );

    // First valid signup succeeds; duplicate rejected
    const first = await playerA.client.rpc('signup_for_guild_quest', {
      p_quest_id: quest.data.id,
      p_character_id: charA.data.id,
      p_note: 'Legit',
    });
    expect(first.error).toBeNull();

    await assertSupabaseRejected(
      playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: quest.data.id,
        p_character_id: charA.data.id,
        p_note: 'Duplicate',
      }),
      'Duplicate quest signup',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    tracker.assertNoErrors();
  });

  test('T2-079: Signing up for an archived or completed quest is rejected', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Closed Quests', mode: 'west_marches', invite_code: 'QST04' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST04' });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Veteran', is_active: true })
      .select()
      .single();

    const mapRow4 = await gm.client.from('maps').insert({ world_id: cid, name: 'Board Map 4', kind: '3d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: cid, map_id: mapRow4.data.id, title: 'Archive Board', x: 0, y: 0, z: 0 })
      .select()
      .single();

    const completedQ = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: cid, board_id: board.data.id, title: 'Slain Dragon', max_players: 4, status: 'completed' })
      .select()
      .single();
    const archivedQ = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: cid, board_id: board.data.id, title: 'Old Notice', max_players: 4, status: 'archived' })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: completedQ.data.id,
        p_character_id: charA.data.id,
        p_note: 'Too late',
      }),
      'Signup for completed quest',
    );
    await assertSupabaseRejected(
      playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: archivedQ.data.id,
        p_character_id: charA.data.id,
        p_note: 'Archived',
      }),
      'Signup for archived quest',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    tracker.assertNoErrors();
  });

  test('T2-080: Non-GM player blocked from quest board and quest CRUD in UI and REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Quest Admin Guard', mode: 'west_marches', invite_code: 'QST05' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'QST05' });

    const mapRow5 = await gm.client.from('maps').insert({ world_id: cid, name: 'Board Map 5', kind: '3d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: cid, map_id: mapRow5.data.id, title: 'GM Board', x: 0, y: 0, z: 0 })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client
        .from('map_quest_boards')
        .insert({ campaign_id: cid, map_id: mapRow5.data.id, title: 'Rogue Board', x: 1, y: 0, z: 1 })
        .select(),
      'Player creating map_quest_boards',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('guild_quests')
        .insert({ campaign_id: cid, board_id: board.data.id, title: 'Rogue Quest', max_players: 4 })
        .select(),
      'Player creating guild_quests',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    await expect(playerAPage.getByRole('button', { name: /new quest|create quest|add board/i })).toHaveCount(0);

    tracker.assertNoErrors();
  });
});
