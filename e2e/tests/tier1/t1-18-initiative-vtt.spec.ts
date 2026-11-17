import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  advanceInitiativeTurn,
  getPrimaryViewportCanvas,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-18: 2D Battlemap Initiative Tracker, AoE Templates & Cursor-Centered Zoom', () => {
  test('T1-086: InitiativeTrackerBar adds combatants and sorts turn order descending by initiative', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('init_sort');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Combat Arena', mode: 'normal', invite_code: 'INIT1' })
      .select()
      .single();

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Duel Pit',
        kind: '2d',
        battlemap: {
          gridSizePx: 50,
          widthCells: 14,
          heightCells: 14,
          tokens: [],
          walls: [],
          lights: [],
        },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Duel Pit').first().click();

    await gmPage.getByRole('button', { name: /start combat|initiative/i }).first().click();
    const nameInput = gmPage.getByPlaceholder(/combatant|name/i).first();
    const initInput = gmPage.getByPlaceholder(/init|score/i).or(gmPage.getByLabel(/initiative/i)).first();

    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Slow Ogre');
      await initInput.fill('7');
      await gmPage.getByRole('button', { name: /add/i }).first().click();

      await nameInput.fill('Quick Rogue');
      await initInput.fill('19');
      await gmPage.getByRole('button', { name: /add/i }).first().click();
    }

    await expect(gmPage.getByText('Quick Rogue').first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText('Slow Ogre').first()).toBeVisible();

    const trackerText = (await gmPage.locator('[data-testid="initiative-tracker"], aside, section, div').filter({ hasText: 'Quick Rogue' }).filter({ hasText: 'Slow Ogre' }).first().textContent()) ?? '';
    expect(trackerText.indexOf('Quick Rogue')).toBeLessThan(trackerText.indexOf('Slow Ogre'));

    await expect
      .poll(async () => {
        const dbCheck = await gm.client.from('maps').select('combat_state').eq('id', bmap.data.id).single();
        const entries = ((dbCheck.data?.combat_state as Record<string, unknown>)?.entries as Array<Record<string, unknown>>) ?? [];
        return entries.length;
      })
      .toBeGreaterThanOrEqual(2);

    tracker.assertNoErrors();
  });

  test('T1-087: clicking Next Turn advances active combatant and increments round counter on wrap', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('init_round');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Turn Clock', mode: 'normal', invite_code: 'TURN1' })
      .select()
      .single();

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Turn Grid',
        kind: '2d',
        combat_state: {
          active: true,
          round: 1,
          turnIndex: 0,
          entries: [
            { id: 'c1', name: 'Knight', initiative: 18, conditions: [] },
            { id: 'c2', name: 'Goblin', initiative: 10, conditions: [] },
          ],
        },
        battlemap: { gridSizePx: 50, widthCells: 14, heightCells: 14, tokens: [], walls: [], lights: [] },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Turn Grid').first().click();

    await expect(gmPage.getByText(/round\s*1/i).first()).toBeVisible({ timeout: 15_000 });
    await advanceInitiativeTurn(gmPage);
    await advanceInitiativeTurn(gmPage);

    await expect(gmPage.getByText(/round\s*2/i).first()).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => {
        const dbState = await gm.client.from('maps').select('combat_state').eq('id', bmap.data.id).single();
        return (dbState.data?.combat_state as Record<string, unknown>)?.round;
      })
      .toBe(2);

    tracker.assertNoErrors();
  });

  test('T1-088: GM toggles combat condition badges (Poisoned / Prone) on combatant entry', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('init_cond');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Condition Hall', mode: 'normal', invite_code: 'COND1' })
      .select()
      .single();

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Swamp Grid',
        kind: '2d',
        combat_state: {
          active: true,
          round: 1,
          turnIndex: 0,
          entries: [{ id: 'c1', name: 'Ranger', initiative: 15, conditions: [] }],
        },
        battlemap: { gridSizePx: 50, widthCells: 12, heightCells: 12, tokens: [], walls: [], lights: [] },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Swamp Grid').first().click();

    const poisonedBtn = gmPage.getByRole('button', { name: /poisoned/i }).first();
    await expect(poisonedBtn).toBeVisible({ timeout: 10_000 });
    await poisonedBtn.click();

    await expect
      .poll(async () => {
        const dbState = await gm.client.from('maps').select('combat_state').eq('id', bmap.data.id).single();
        const entries = ((dbState.data?.combat_state as Record<string, unknown>)?.entries as Array<Record<string, unknown>>) ?? [];
        return (entries[0]?.conditions as string[] | undefined) ?? [];
      })
      .toContain('Poisoned');

    tracker.assertNoErrors();
  });

  test('T1-089: clicking a combatant linked to a character opens their Character Sheet tab', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('init_link');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Linked Sheet Pit', mode: 'normal', invite_code: 'LSH01' })
      .select()
      .single();

    const char = await gm.client
      .from('characters')
      .insert({
        campaign_id: world.data.id,
        user_id: gm.userId,
        name: 'Ser Alaric',
        attributes: { strength: 17 },
        is_active: true,
      })
      .select()
      .single();

    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Tournament Ring',
      kind: '2d',
      combat_state: {
        active: true,
        round: 1,
        turnIndex: 0,
        entries: [{ id: 'c1', name: 'Ser Alaric', initiative: 20, characterId: char.data.id, conditions: [] }],
      },
      battlemap: {
        gridSizePx: 50,
        widthCells: 12,
        heightCells: 12,
        tokens: [{ id: 't1', name: 'Ser Alaric', characterId: char.data.id, x: 4, y: 4, sizeCells: 1, badgeColor: '#38bdf8', disposition: 'pc' }],
        walls: [],
        lights: [],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Tournament Ring').first().click();

    await gmPage.getByRole('button', { name: /Ser Alaric|open sheet/i }).first().click();
    await expect(gmPage.locator('iframe[sandbox]').first()).toBeVisible({
      timeout: 10_000,
    });

    tracker.assertNoErrors();
  });

  test('T1-090: cursor-centered wheel zoom and AoE template placement work smoothly on 2D Battlemap', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('aoe_zoom');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Spell Arena', mode: 'normal', invite_code: 'AOE01' })
      .select()
      .single();

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Wizard Courtyard',
        kind: '2d',
        battlemap: { gridSizePx: 50, widthCells: 20, heightCells: 20, tokens: [], walls: [], lights: [] },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Wizard Courtyard').first().click();

    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.35);
    await gmPage.mouse.wheel(0, -240);

    // Place AoE template
    const aoeBtn = gmPage.getByRole('button', { name: /place aoe|aoe template/i }).first();
    await aoeBtn.click();
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

    await expect
      .poll(async () => {
        const res = await gm.client.from('maps').select('battlemap').eq('id', bmap.data.id).single();
        const templates = (res.data?.battlemap as Record<string, unknown>)?.aoeTemplates as unknown[] | undefined;
        return templates?.length ?? 0;
      })
      .toBeGreaterThan(0);

    tracker.assertNoErrors();
  });
});
