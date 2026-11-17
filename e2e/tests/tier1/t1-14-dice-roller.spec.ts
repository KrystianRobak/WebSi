import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  getSheetSandboxIframe,
  openSidebarSection,
  rollDiceInDrawer,
  signInViaAuthScreen,
  toggleDiceDrawer,
} from '../../helpers/uiActions.js';

test.describe('UF-14: Realtime Dice Parser, DiceRollerDrawer & Roll Log', () => {
  test('T1-066: TopHeader dice button toggles DiceRollerDrawer open and closed cleanly', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('dicetog');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    await gm.client.from('worlds').insert({ name: 'Dice Hall', mode: 'normal', invite_code: 'DICE1' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await toggleDiceDrawer(gmPage);
    const rollInput = gmPage.getByLabel('Dice Expression').or(gmPage.getByPlaceholder(/1d20/i)).first();
    await expect(rollInput).toBeVisible();

    await toggleDiceDrawer(gmPage);
    await expect(rollInput).not.toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-067: rolling 2d6+3 in DiceRollerDrawer computes valid total in [5, 15] and records in dice_rolls', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('dice2d6');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Roll Tavern', mode: 'normal', invite_code: 'D2D61' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await toggleDiceDrawer(gmPage);

    const postPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/dice_rolls') && res.request().method() === 'POST',
    );
    await rollDiceInDrawer(gmPage, '2d6+3');
    expect((await postPromise).ok()).toBe(true);

    const rolls = await gm.client.from('dice_rolls').select('expression, total').eq('campaign_id', world.data.id);
    expect(rolls.data).toHaveLength(1);
    expect(rolls.data?.[0].expression).toBe('2d6+3');
    expect(Number(rolls.data?.[0].total)).toBeGreaterThanOrEqual(5);
    expect(Number(rolls.data?.[0].total)).toBeLessThanOrEqual(15);

    tracker.assertNoErrors();
  });

  test('T1-068: advantage 2d20kh1+4 and disadvantage 2d20kl1 render kept vs dropped dice breakdown', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('advdice');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Advantage Keep', mode: 'normal', invite_code: 'ADV01' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await toggleDiceDrawer(gmPage);

    await rollDiceInDrawer(gmPage, '2d20kh1+4');
    await expect(gmPage.getByText(/2d20kh1\+4/).first()).toBeVisible({ timeout: 10_000 });

    await rollDiceInDrawer(gmPage, '2d20kl1');
    await expect(gmPage.getByText(/2d20kl1/).first()).toBeVisible({ timeout: 10_000 });

    const dbRolls = await gm.client.from('dice_rolls').select('expression, total').eq('campaign_id', world.data.id);
    expect(dbRolls.data).toHaveLength(2);
    expect(Number(dbRolls.data?.[0].total)).toBeGreaterThanOrEqual(5);
    expect(Number(dbRolls.data?.[0].total)).toBeLessThanOrEqual(24);
    expect(Number(dbRolls.data?.[1].total)).toBeGreaterThanOrEqual(1);
    expect(Number(dbRolls.data?.[1].total)).toBeLessThanOrEqual(20);

    tracker.assertNoErrors();
  });

  test('T1-069: 4d6dl1 stat roll and d100 percentile roll evaluate within valid bounds', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('statdice');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Percentile Keep', mode: 'normal', invite_code: 'STAT1' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await toggleDiceDrawer(gmPage);

    await rollDiceInDrawer(gmPage, '4d6dl1');
    await rollDiceInDrawer(gmPage, 'd100');

    await expect
      .poll(async () => (await gm.client.from('dice_rolls').select('id').eq('campaign_id', world.data.id)).data?.length ?? 0)
      .toBe(2);

    const dbRolls = await gm.client.from('dice_rolls').select('expression, total').eq('campaign_id', world.data.id);
    const statRoll = dbRolls.data?.find((r) => r.expression === '4d6dl1');
    const pctRoll = dbRolls.data?.find((r) => r.expression === 'd100');
    expect(Number(statRoll?.total)).toBeGreaterThanOrEqual(3);
    expect(Number(statRoll?.total)).toBeLessThanOrEqual(18);
    expect(Number(pctRoll?.total)).toBeGreaterThanOrEqual(1);
    expect(Number(pctRoll?.total)).toBeLessThanOrEqual(100);

    tracker.assertNoErrors();
  });

  test('T1-070: clicking [[roll]] inside sandboxed character sheet pushes Realtime roll to connected player drawer', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerPlayer = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('rtdice_gm');
    const pCreds = makeUserCredentials('rtdice_p');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Realtime Dice Hall', mode: 'normal', invite_code: 'RTD01' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'RTD01' });

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: 'Quick Strike Sheet',
        html_template:
          '<div><input type="number" name="attr_bonus" value="4" /><button type="button" data-roll="[[1d20+@{bonus}]]" data-roll-label="Quick Strike">Strike [[1d20+@{bonus}]]</button></div>',
        css_template: '',
        schema_json: { defaults: { bonus: 4 }, computed: {} },
      })
      .select()
      .single();

    await player.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: player.userId,
      sheet_template_id: tpl.data.id,
      name: 'Lyra Blade',
      attributes: { bonus: 4 },
      is_active: true,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await toggleDiceDrawer(gmPage);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Lyra Blade').first().click();

    const iframe = await getSheetSandboxIframe(playerAPage);
    await iframe.getByRole('button', { name: /strike/i }).first().click();

    const drawer = gmPage.locator('section[aria-label="Dice Roller Drawer"]');
    await expect(drawer.getByText(/Quick Strike|1d20\+4/i).first()).toBeVisible({ timeout: 15_000 });

    trackerGm.assertNoErrors();
    trackerPlayer.assertNoErrors();
  });
});
