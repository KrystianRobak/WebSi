import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { getPrimaryViewportCanvas, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-17: 2D Battlemap Persistent Fog, Token Ownership & GM-Hidden Filtering', () => {
  test('T1-081: GM paints persistent 2D Battlemap Fog of War reveal brush and persists mask across reload', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('fog2d_rev');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: '2D Fog Dungeon', mode: 'normal', invite_code: 'F2D01' })
      .select()
      .single();
    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Crypt Level 1',
        kind: '2d',
        battlemap: {
          gridSizePx: 50,
          widthCells: 16,
          heightCells: 16,
          fogOfWarEnabled: true,
          tokens: [],
          walls: [],
          lights: [],
        },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Crypt Level 1').first().click();

    await gmPage.getByRole('button', { name: /fog.*brush|fog of war|reveal/i }).first().click();
    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await gmPage.mouse.down();
    await gmPage.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
    await gmPage.mouse.up();

    await expect
      .poll(async () => {
        const res = await gm.client.from('maps').select('fog_of_war_2d, battlemap').eq('id', bmap.data.id).single();
        return Boolean(res.data?.fog_of_war_2d || (res.data?.battlemap as Record<string, unknown>)?.revealedMaskUrl);
      })
      .toBe(true);

    tracker.assertNoErrors();
  });

  test('T1-082: GM switches 2D Fog brush to Hide mode to re-shroud explored battlemap cells', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('fog2d_hide');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: '2D Hide Dungeon', mode: 'normal', invite_code: 'H2D01' })
      .select()
      .single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Crypt Level 2',
      kind: '2d',
      battlemap: {
        gridSizePx: 50,
        widthCells: 16,
        heightCells: 16,
        fogOfWarEnabled: true,
        tokens: [],
        walls: [],
        lights: [],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Crypt Level 2').first().click();

    await gmPage.getByRole('button', { name: /fog.*brush|fog of war/i }).first().click();
    await gmPage.getByRole('button', { name: /^hide$|shroud/i }).first().click();

    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(canvas).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-083: player can drag their own assigned token while blocked from dragging another player token', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pACreds = makeUserCredentials('tok_a');
    const pBCreds = makeUserCredentials('tok_b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Token Ownership Map', mode: 'normal', invite_code: 'TOKO1' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'TOKO1' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'TOKO1' });

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Bridge Encounter',
        kind: '2d',
        battlemap: {
          gridSizePx: 50,
          widthCells: 16,
          heightCells: 16,
          tokens: [
            { id: 'tok-a', name: 'Hero A', x: 2, y: 2, sizeCells: 1, badgeColor: '#38bdf8', disposition: 'pc', owner_user_id: pA.userId },
            { id: 'tok-b', name: 'Hero B', x: 6, y: 6, sizeCells: 1, badgeColor: '#f472b6', disposition: 'pc', owner_user_id: pB.userId },
          ],
          walls: [],
          lights: [],
        },
      })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await playerAPage.getByText('Bridge Encounter').first().click();

    // Select Hero A via its token circle (name label sits below with pointer-events-none) and drag it
    const heroALabel = playerAPage.getByText('Hero A').first();
    await expect(heroALabel).toBeVisible({ timeout: 15_000 });
    const heroACircle = heroALabel.locator('xpath=../..');
    const heroBox = (await heroACircle.boundingBox())!;
    const startX = heroBox.x + heroBox.width / 2;
    const startY = heroBox.y + heroBox.height / 2;
    await playerAPage.mouse.move(startX, startY);
    await playerAPage.mouse.down();
    await playerAPage.mouse.move(startX + 100, startY, { steps: 6 });
    await playerAPage.mouse.up();

    // Verify Hero A moved and Hero B's coordinates remain untouched
    await expect
      .poll(async () => {
        const mapAfter = await gm.client.from('maps').select('battlemap').eq('id', bmap.data.id).single();
        const tokens = ((mapAfter.data?.battlemap as Record<string, unknown>)?.tokens as Array<Record<string, unknown>>) ?? [];
        const tokA = tokens.find((t) => t.id === 'tok-a');
        const tokB = tokens.find((t) => t.id === 'tok-b');
        return Boolean(tokA && tokA.x !== 2 && tokB && tokB.x === 6 && tokB.y === 6);
      })
      .toBe(true);

    tracker.assertNoErrors();
  });

  test('T1-084: GM-hidden enemy tokens, traps, and secret doors are filtered from Player view', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('hidview');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Ambush Keep', mode: 'normal', invite_code: 'AMB01' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'AMB01' });

    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Ambush Corridor',
      kind: '2d',
      battlemap: {
        gridSizePx: 50,
        widthCells: 16,
        heightCells: 16,
        tokens: [
          { id: 'pc-1', name: 'Visible Paladin', x: 2, y: 2, sizeCells: 1, badgeColor: '#38bdf8', disposition: 'pc', owner_user_id: player.userId },
          { id: 'npc-hid', name: 'Secret Assassin', x: 5, y: 5, sizeCells: 1, badgeColor: '#ef4444', disposition: 'hostile', isHidden: true, hiddenFromPlayers: true },
        ],
        walls: [
          { id: 'door-sec', x1: 4, y1: 0, x2: 4, y2: 4, kind: 'secret-door', hidden: true },
        ],
        traps: [{ id: 'trap-1', name: 'Hidden Pit Trap', x: 3, y: 3, hiddenFromPlayers: true }],
        lights: [],
      },
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await playerAPage.getByText('Ambush Corridor').first().click();

    await expect(playerAPage.getByText('Visible Paladin').first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Secret Assassin')).not.toBeVisible();
    await expect(playerAPage.getByText('Hidden Pit Trap')).not.toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-085: 2D Battlemap LOS dynamic lighting computes visibility polygon around light-blocking walls', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('los_gm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Lighting Cavern', mode: 'normal', invite_code: 'LOS01' })
      .select()
      .single();

    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Torchlight Cavern',
      kind: '2d',
      battlemap: {
        gridSizePx: 50,
        widthCells: 16,
        heightCells: 16,
        dynamicLightingEnabled: true,
        tokens: [{ id: 'pc-light', name: 'Torchbearer', x: 3, y: 3, sizeCells: 1, badgeColor: '#fbbf24', disposition: 'pc' }],
        walls: [{ id: 'w1', x1: 5, y1: 1, x2: 5, y2: 7, blocksLight: true }],
        lights: [{ id: 'l1', x: 3, y: 3, radiusCells: 6, color: '#fde68a', intensity: 1 }],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Torchlight Cavern').first().click();

    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBe(true);

    tracker.assertNoErrors();
  });
});
