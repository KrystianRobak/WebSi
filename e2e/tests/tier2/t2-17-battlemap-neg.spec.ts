import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { getPrimaryViewportCanvas, openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-17 Negative & Boundary: 2D Battlemap Fog, Token Ownership & GM-Hidden Filtering', () => {
  test('T2-081: Player A blocked from dragging Player B token or unowned GM monster token', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Token Ownership 2D', mode: 'normal', invite_code: 'BMAP01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'BMAP01' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'BMAP01' });

    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: cid,
        name: 'Combat Grid',
        kind: '2d',
        battlemap: {
          tokens: [
            { id: 'tok-a', label: 'Hero A', x: 150, y: 150, owner_user_id: playerA.userId, hidden: false },
            { id: 'tok-b', label: 'Hero B', x: 300, y: 300, owner_user_id: playerB.userId, hidden: false },
            { id: 'tok-gm', label: 'Ogre Boss', x: 450, y: 450, owner_user_id: null, hidden: false },
          ],
          walls: [],
          lights: [],
        },
      })
      .select()
      .single();

    // REST check: Player A cannot patch maps directly
    await assertSupabaseRejected(
      playerA.client.from('maps').update({ name: 'Tampered' }).eq('id', mapRow.data.id).select(),
      'Player A updating 2D battlemap tokens',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    const mapItem = playerAPage.getByText('Combat Grid').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }

    const canvas = await getPrimaryViewportCanvas(playerAPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    if (box) {
      // Attempt drag near Player B / GM token coordinates
      await playerAPage.mouse.move(box.x + 300, box.y + 300);
      await playerAPage.mouse.down();
      await playerAPage.mouse.move(box.x + 500, box.y + 500, { steps: 5 });
      await playerAPage.mouse.up();
    }

    // Verify tok-b & tok-gm positions remained untouched in DB
    const dbMap = await gm.client.from('maps').select('battlemap').eq('id', mapRow.data.id).single();
    const tokens = ((dbMap.data?.battlemap as { tokens?: Array<{ id: string; x: number; y: number }> })?.tokens) ?? [];
    expect(tokens.find((t) => t.id === 'tok-b')?.x).toBe(300);
    expect(tokens.find((t) => t.id === 'tok-gm')?.x).toBe(450);

    tracker.assertNoErrors();
  });

  test('T2-082: GM-hidden token/trap/door absent from Player A battlemap view and DOM', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Hidden Trap 2D', mode: 'normal', invite_code: 'BMAP02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'BMAP02' });

    await gm.client.from('maps').insert({
      world_id: cid,
      name: 'Ambush Corridor',
      kind: '2d',
      battlemap: {
        tokens: [
          { id: 'tok-vis', label: 'Torchbearer', x: 100, y: 100, owner_user_id: playerA.userId, hidden: false },
          { id: 'tok-ambush', label: 'SECRET_MIMIC_AMBUSH', x: 250, y: 250, hidden: true, isGmOnly: true },
        ],
        walls: [{ id: 'door-secret', x1: 200, y1: 100, x2: 200, y2: 200, kind: 'secret_door', hidden: true }],
        lights: [],
      },
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    const mapItem = playerAPage.getByText('Ambush Corridor').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }

    await expect(playerAPage.getByText('SECRET_MIMIC_AMBUSH')).toHaveCount(0);
    tracker.assertNoErrors();
  });

  test('T2-083: Non-GM player blocked from 2D battlemap fog brush and fog_of_war_2d writes', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: '2D Fog Guard', mode: 'normal', invite_code: 'BMAP03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'BMAP03' });

    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: cid,
        name: 'Foggy Crypt',
        kind: '2d',
        battlemap: { tokens: [], walls: [], lights: [], fogOfWarEnabled: true },
      })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client.from('maps').update({ fog_of_war_2d: 'data:image/png;base64,hacked' }).eq('id', mapRow.data.id).select(),
      'Player A writing maps.fog_of_war_2d',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    const mapItem = playerAPage.getByText('Foggy Crypt').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }

    await expect(playerAPage.getByRole('button', { name: /fog brush|reveal fog|hide fog/i })).toHaveCount(0);
    tracker.assertNoErrors();
  });

  test('T2-084: Out-of-bounds token drag clamps cleanly within finite map coordinates', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Clamp 2D Token', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Bounded Arena',
      kind: '2d',
      battlemap: {
        tokens: [{ id: 'tok-1', label: 'Vanguard', x: 120, y: 120, hidden: false }],
        walls: [],
        lights: [],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');
    const mapItem = gmPage.getByText('Bounded Arena').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }

    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    if (box) {
      await gmPage.mouse.move(box.x + 120, box.y + 120);
      await gmPage.mouse.down();
      await gmPage.mouse.move(-500, -500, { steps: 4 });
      await gmPage.mouse.up();
    }

    await expect(canvas).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-085: Battlemap with fogOfWarEnabled=true, 0 walls, and 0 lights renders safely', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Dark Void 2D', mode: 'normal', invite_code: 'BMAP05' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'BMAP05' });

    await gm.client.from('maps').insert({
      world_id: cid,
      name: 'Pitch Black Cavern',
      kind: '2d',
      battlemap: { tokens: [], walls: [], lights: [], fogOfWarEnabled: true },
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    const mapItem = playerAPage.getByText('Pitch Black Cavern').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }

    await expect(await getPrimaryViewportCanvas(playerAPage)).toBeVisible({ timeout: 15_000 });
    tracker.assertNoErrors();
  });
});
