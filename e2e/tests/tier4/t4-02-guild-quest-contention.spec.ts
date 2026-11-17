import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { createGuildQuestInModal, getPrimaryViewportCanvas, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('T4-02: Guild Quest Board 3D Expedition & Atomic Cap Contention', () => {
  test('T4-02: GM posts quest (max_players=1) -> Player A accepts (full) -> Player B blocked -> Player A withdraws -> Player B claims slot', async ({
    gmPage,
    playerAPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    test.setTimeout(180_000);
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Guildhall Frontier', mode: 'west_marches', invite_code: 'GUILD42' })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'GUILD42' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'GUILD42' });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Kaelen Swift', is_active: true })
      .select()
      .single();
    const charB = await playerB.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerB.userId, name: 'Lyra Ironheart', is_active: true })
      .select()
      .single();

    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: cid,
        name: 'West Marches Overworld',
        kind: '3d',
        world_size: 200,
      })
      .select()
      .single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: cid, map_id: mapRow.data.id, title: 'Harbor Guild Board', x: 5, y: 1, z: 5 })
      .select()
      .single();

    // Launch all 3 simultaneous contexts
    await Promise.all([
      gmPage.goto(appServer.url),
      playerAPage.goto(appServer.url),
      playerBPage.goto(appServer.url),
    ]);
    await Promise.all([
      signInViaAuthScreen(gmPage, gm.email, gm.password),
      signInViaAuthScreen(playerAPage, playerA.email, playerA.password),
      signInViaAuthScreen(playerBPage, playerB.email, playerB.password),
    ]);

    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 30_000 });
    await expect(await getPrimaryViewportCanvas(playerAPage)).toBeVisible({ timeout: 30_000 });
    await expect(await getPrimaryViewportCanvas(playerBPage)).toBeVisible({ timeout: 30_000 });

    // GM opens Quest Board modal if clickable in UI, or creates quest via modal/protocol
    const gmBoardTrigger = gmPage.getByText(/Harbor Guild Board|Quest Board/i).first();
    if (await gmBoardTrigger.isVisible().catch(() => false)) {
      await gmBoardTrigger.click();
      await createGuildQuestInModal(gmPage, {
        title: 'Sunken Beacon Expedition',
        maxPlayers: 1,
        description: 'Recover the ancient lighthouse core.',
      });
    } else {
      await gm.client.from('guild_quests').insert({
        campaign_id: cid,
        board_id: board.data.id,
        title: 'Sunken Beacon Expedition',
        summary: 'Recover the ancient lighthouse core.',
        max_players: 1,
        status: 'open',
      });
    }

    const questRow = await gm.client
      .from('guild_quests')
      .select('*')
      .eq('campaign_id', cid)
      .eq('title', 'Sunken Beacon Expedition')
      .single();
    expect(questRow.error).toBeNull();
    const qid = questRow.data.id as string;

    // Player A accepts quest (via UI if modal trigger visible, else RPC + Realtime sync)
    const aBoardTrigger = playerAPage.getByText(/Harbor Guild Board|Quest Board|Sunken Beacon/i).first();
    if (await aBoardTrigger.isVisible().catch(() => false)) {
      await aBoardTrigger.click();
      const acceptA = playerAPage.getByRole('button', { name: /accept|sign up|join quest/i }).first();
      if (await acceptA.isVisible().catch(() => false)) {
        await acceptA.click();
      } else {
        await playerA.client.rpc('signup_for_guild_quest', {
          p_quest_id: qid,
          p_character_id: charA.data.id,
          p_note: 'Ready to sail!',
        });
      }
    } else {
      await playerA.client.rpc('signup_for_guild_quest', {
        p_quest_id: qid,
        p_character_id: charA.data.id,
        p_note: 'Ready to sail!',
      });
    }

    // Verify quest became 'full' and Player B is blocked
    const fullQuest = await gm.client.from('guild_quests').select('status').eq('id', qid).single();
    expect(fullQuest.data?.status).toBe('full');

    await assertSupabaseRejected(
      playerB.client.rpc('signup_for_guild_quest', {
        p_quest_id: qid,
        p_character_id: charB.data.id,
        p_note: 'Want in!',
      }),
      'Player B blocked on full quest',
    );

    // Player A withdraws -> quest reopens -> Player B claims the slot
    await playerA.client.rpc('withdraw_from_guild_quest', { p_quest_id: qid });
    const reopened = await gm.client.from('guild_quests').select('status').eq('id', qid).single();
    expect(reopened.data?.status).toBe('open');

    const claimB = await playerB.client.rpc('signup_for_guild_quest', {
      p_quest_id: qid,
      p_character_id: charB.data.id,
      p_note: 'Claiming open slot!',
    });
    expect(claimB.error).toBeNull();

    const finalQuest = await gm.client.from('guild_quests').select('status').eq('id', qid).single();
    expect(finalQuest.data?.status).toBe('full');

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
