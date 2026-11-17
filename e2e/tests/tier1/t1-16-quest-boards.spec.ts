import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  createGuildQuestInModal,
  getPrimaryViewportCanvas,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-16: West Marches Guild Quest Boards (3D & 2D) & Atomic Player-Cap Signups', () => {
  test('T1-076: GM places a 3D Quest Board marker on the 3D Map and persists map_quest_boards row', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('qb3d_gm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Quest Hub 3D', mode: 'west_marches', invite_code: 'QB3D1' })
      .select()
      .single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Frontier 3D',
      kind: '3d',
      world_size: 200,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Frontier 3D').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Frontier 3D').first().click();

    await gmPage.getByRole('button', { name: /top view/i }).first().click();
    await gmPage.getByRole('button', { name: /quest board|place board/i }).first().click();
    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await gmPage.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const box = (await canvas.boundingBox())!;
    const postBoard = gmPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/map_quest_boards') && res.request().method() === 'POST',
    );
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    expect((await postBoard).ok()).toBe(true);

    const boards = await gm.client.from('map_quest_boards').select('id').eq('campaign_id', world.data.id);
    expect((boards.data ?? []).length).toBeGreaterThanOrEqual(1);

    tracker.assertNoErrors();
  });

  test('T1-077: 2D Battlemap displays interactive Quest Board badge with accurate open quest count', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('qb2d_p');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Quest Hub 2D', mode: 'west_marches', invite_code: 'QB2D1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'QB2D1' });

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Guildhall 2D',
        kind: '2d',
        battlemap: { gridSizePx: 50, widthCells: 16, heightCells: 16, tokens: [], walls: [], lights: [] },
      })
      .select()
      .single();

    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: world.data.id, map_id: bmap.data.id, title: 'Tavern Notice Board', x: 5, y: 5, z: 0 })
      .select()
      .single();

    await gm.client.from('guild_quests').insert([
      { campaign_id: world.data.id, board_id: board.data.id, title: 'Clear Goblin Den', max_players: 4, status: 'open' },
      { campaign_id: world.data.id, board_id: board.data.id, title: 'Escort Caravan', max_players: 3, status: 'open' },
    ]);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await playerAPage.getByText('Guildhall 2D').first().click();

    const badge = playerAPage.getByRole('button', { name: /Tavern Notice Board|Quest Board/i }).first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText('2');

    tracker.assertNoErrors();
  });

  test('T1-078: GM creates a Guild Quest with max_players cap inside GuildQuestBoardModal', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('qbcreate');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Quest Forge', mode: 'west_marches', invite_code: 'QFOR1' })
      .select()
      .single();
    const bmap = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Board Map', kind: '2d' })
      .select()
      .single();
    await gm.client.from('map_quest_boards').insert({
      campaign_id: world.data.id,
      map_id: bmap.data.id,
      title: 'Iron Gate Board',
      x: 4,
      y: 4,
      z: 0,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Board Map').first().click();
    await gmPage.getByRole('button', { name: /Iron Gate Board|Quest Board/i }).first().click();

    await createGuildQuestInModal(gmPage, {
      title: 'Slay the Frost Wyrm',
      maxPlayers: 3,
      description: 'High risk expedition north of the ridge.',
    });

    await expect(gmPage.getByText('Slay the Frost Wyrm').first()).toBeVisible({ timeout: 10_000 });
    const dbQuest = await gm.client
      .from('guild_quests')
      .select('title, max_players, status')
      .eq('campaign_id', world.data.id)
      .single();
    expect(dbQuest.data?.title).toBe('Slay the Frost Wyrm');
    expect(dbQuest.data?.max_players).toBe(3);
    expect(dbQuest.data?.status).toBe('open');

    tracker.assertNoErrors();
  });

  test('T1-079: player clicks "Accept Task" on quest with max_players=1 and quest transitions to status="full"', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('qbaccept');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Solo Contract', mode: 'west_marches', invite_code: 'SOLO1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'SOLO1' });
    await player.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: player.userId,
      name: 'Kaelen Solo',
      is_active: true,
    });

    const bmap = await gm.client.from('maps').insert({ world_id: world.data.id, name: 'Solo Map', kind: '2d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: world.data.id, map_id: bmap.data.id, title: 'Bounty Post', x: 2, y: 2, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: world.data.id, board_id: board.data.id, title: 'Scout Watchtower', max_players: 1, status: 'open' })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await playerAPage.getByText('Solo Map').first().click();
    await playerAPage.getByRole('button', { name: /Bounty Post|Quest Board/i }).first().click();

    await playerAPage.getByRole('button', { name: /accept task|accept|sign up/i }).first().click();

    await expect
      .poll(async () => (await gm.client.from('guild_quests').select('status').eq('id', quest.data.id).single()).data?.status)
      .toBe('full');
    await expect(playerAPage.getByText(/full/i).first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-080: player withdraws from full quest and quest automatically reopens to status="open"', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('qbwithdraw');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Withdraw Guild', mode: 'west_marches', invite_code: 'WDR01' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'WDR01' });
    const char = await player.client
      .from('characters')
      .insert({ campaign_id: world.data.id, user_id: player.userId, name: 'Runner', is_active: true })
      .select()
      .single();

    const bmap = await gm.client.from('maps').insert({ world_id: world.data.id, name: 'Guild Map', kind: '2d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: world.data.id, map_id: bmap.data.id, title: 'Contract Board', x: 2, y: 2, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: world.data.id, board_id: board.data.id, title: 'Deliver Scrolls', max_players: 1, status: 'open' })
      .select()
      .single();

    await player.client.rpc('signup_for_guild_quest', {
      p_quest_id: quest.data.id,
      p_character_id: char.data.id,
      p_note: 'Ready',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await playerAPage.getByText('Guild Map').first().click();
    await playerAPage.getByRole('button', { name: /Contract Board|Quest Board/i }).first().click();

    await playerAPage.getByRole('button', { name: /withdraw|leave quest/i }).first().click();

    await expect
      .poll(async () => (await gm.client.from('guild_quests').select('status').eq('id', quest.data.id).single()).data?.status)
      .toBe('open');
    await expect(playerAPage.getByText(/open/i).first()).toBeVisible();

    tracker.assertNoErrors();
  });
});
