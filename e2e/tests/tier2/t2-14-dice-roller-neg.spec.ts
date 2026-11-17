import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { rollDiceInDrawer, signInViaAuthScreen, toggleDiceDrawer } from '../../helpers/uiActions.js';

test.describe('UF-14 Negative & Boundary: Realtime Dice Parser, Roller Drawer & Roll Log', () => {
  test('T2-066: Invalid dice strings ("abc", "0d20", "-5d6") rejected without invalid DB rows', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Dice Rejections', mode: 'normal', invite_code: 'DICE01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'DICE01' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await toggleDiceDrawer(playerAPage);

    for (const badExpr of ['abc', '0d20', '-5d6']) {
      await rollDiceInDrawer(playerAPage, badExpr);
    }

    const rolls = await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cid);
    expect(rolls.data).toEqual([]);
    tracker.assertNoErrors();
  });

  test('T2-067: Huge dice pool (100000d20) capped or rejected cleanly without hang', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Dice Cap', mode: 'normal', invite_code: 'DICE02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'DICE02' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await toggleDiceDrawer(playerAPage);

    const startMs = Date.now();
    await rollDiceInDrawer(playerAPage, '100000d20');
    const elapsedMs = Date.now() - startMs;
    expect(elapsedMs).toBeLessThan(5000);

    await expect(playerAPage.locator('header')).toBeVisible();
    const rolls = await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cid);
    for (const r of rolls.data ?? []) {
      expect(Number.isFinite(Number(r.total))).toBe(true);
    }

    tracker.assertNoErrors();
  });

  test('T2-068: Blind GM roll (is_gm_blind=true) hidden from players in UI and REST', async ({
    gmPage,
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Blind Roll Hall', mode: 'normal', invite_code: 'DICE03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'DICE03' });

    await gm.client.from('dice_rolls').insert({
      campaign_id: cid,
      user_id: gm.userId,
      label: 'SECRET_BLIND_PERCEPTION',
      expression: '1d20+9',
      total: 27,
      is_gm_blind: true,
    });

    // REST check: Player A sees 0 blind rolls
    const playerRolls = await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cid);
    expect(playerRolls.data).toEqual([]);

    // UI check
    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await toggleDiceDrawer(gmPage);
    await expect(gmPage.getByText(/SECRET_BLIND_PERCEPTION|27/).first()).toBeVisible({ timeout: 10_000 });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await toggleDiceDrawer(playerAPage);
    await expect(playerAPage.getByText('SECRET_BLIND_PERCEPTION')).toHaveCount(0);

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
  });

  test('T2-069: Player cannot spoof another user_id when inserting into dice_rolls', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Anti-Spoof Dice', mode: 'normal', invite_code: 'DICE04' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'DICE04' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'DICE04' });

    await assertSupabaseRejected(
      playerA.client
        .from('dice_rolls')
        .insert({
          campaign_id: cid,
          user_id: playerB.userId,
          label: 'Spoofed Roll',
          expression: '1d20',
          total: 20,
          is_gm_blind: false,
        })
        .select(),
      'Player A spoofing Player B user_id on dice_rolls',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 10_000 });
    tracker.assertNoErrors();
  });

  test('T2-070: Keep/drop boundary expressions (2d20kh5, 2d20dl2) handle safely without NaN', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Keep Drop Boundary', mode: 'normal', invite_code: 'DICE05' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'DICE05' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await toggleDiceDrawer(playerAPage);

    await rollDiceInDrawer(playerAPage, '2d20kh5');
    await rollDiceInDrawer(playerAPage, '2d20dl2');

    await expect(playerAPage.getByText(/\bNaN\b/)).toHaveCount(0);
    const rolls = await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cid);
    for (const r of rolls.data ?? []) {
      expect(Number.isFinite(Number(r.total))).toBe(true);
    }

    tracker.assertNoErrors();
  });
});
