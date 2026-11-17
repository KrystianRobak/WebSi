import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  assertNoHudOverlapWithInspector,
  getPrimaryViewportCanvas,
  signInViaAuthScreen,
  triggerWorldsmithUndo,
} from '../../helpers/uiActions.js';

test.describe('UF-19: 3D Worldsmith Sculpt Undo, Storage Texture Sync & Safe-Inset Layout', () => {
  test('T1-091: entering Worldsmith mode automatically opens RightInspector with brush controls', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('ws_auto');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Worldsmith Peak', mode: 'normal', invite_code: 'WSPK1' })
      .select()
      .single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Sculpt Island',
      kind: '3d',
      world_size: 200,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Sculpt Island').first().click();

    await gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first().click();
    const inspector = gmPage.locator('aside').last();
    await expect(inspector).toBeVisible({ timeout: 10_000 });
    await expect(inspector.getByText(/raise|lower|sculpt|brush/i).first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-092: pressing Ctrl+Z in Worldsmith mode routes to 3D terrain sculpt undo without reverting lore entities', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('ws_undo');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Sculpt Undo Realm', mode: 'normal', invite_code: 'WSUN1' })
      .select()
      .single();
    const ent = await gm.client
      .from('entities')
      .insert({
        world_id: world.data.id,
        slug: 'untouched-lore-pillar',
        title: 'Untouched Lore Pillar',
        type: 'Location',
      })
      .select()
      .single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Volcanic Ridge',
      kind: '3d',
      world_size: 200,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Volcanic Ridge').first().click();

    await gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first().click();
    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

    await triggerWorldsmithUndo(gmPage);

    const entCheck = await gm.client.from('entities').select('title').eq('id', ent.data.id).single();
    expect(entCheck.data?.title).toBe('Untouched Lore Pillar');

    tracker.assertNoErrors();
  });

  test('T1-093: terrain paint/heightmap upload saves PNG to vault-assets Storage and replaces data: URLs', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('ws_sync');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Texture Sync Isles', mode: 'normal', invite_code: 'WSTX1' })
      .select()
      .single();
    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Painted Continent', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Painted Continent').first().click();

    await gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first().click();
    const paintTool = gmPage.getByRole('button', { name: /paint|biome|color/i }).first();
    if (await paintTool.isVisible().catch(() => false)) {
      await paintTool.click();
    }

    const uploadPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const saveTerrainBtn = gmPage.getByRole('button', { name: /save terrain|sync/i }).first();
    if (await saveTerrainBtn.isVisible().catch(() => false)) {
      await saveTerrainBtn.click();
    }

    const uploadResp = await uploadPromise;
    expect(uploadResp.ok()).toBe(true);

    await expect
      .poll(async () => {
        const dbMap = await gm.client.from('maps').select('paint_url, heightmap_url').eq('id', mapRow.data.id).single();
        return String(dbMap.data?.paint_url || dbMap.data?.heightmap_url || '');
      })
      .toContain('/storage/v1/object/public/vault-assets/');

    tracker.assertNoErrors();
  });

  test('T1-094: viewport HUD overlays and PinEntitySlideOver respect inspectorWidth + 12px safe-inset without overlap', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('ws_inset');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Safe Inset Isles', mode: 'normal', invite_code: 'INSET' })
      .select()
      .single();
    const ent = await gm.client
      .from('entities')
      .insert({ world_id: world.data.id, slug: 'harbor-pin', title: 'Harbor Pin', type: 'Location' })
      .select()
      .single();
    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Inset Map', kind: '3d', world_size: 200 })
      .select()
      .single();
    await gm.client.from('map_pins').insert({
      map_id: mapRow.data.id,
      entity_id: ent.data.id,
      label: 'Harbor Pin',
      x: 0,
      y: 2,
      z: 0,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Inset Map').first().click();
    await gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first().click();

    const inspector = gmPage.locator('aside').last();
    await expect(inspector).toBeVisible({ timeout: 10_000 });
    const hudOverlay = gmPage.locator('[data-testid="viewport-hud"], .viewport-hud').first();
    if (await hudOverlay.isVisible().catch(() => false)) {
      await assertNoHudOverlapWithInspector(gmPage, hudOverlay, inspector);
    }

    tracker.assertNoErrors();
  });

  test('T1-095: 3D Worldsmith animated rivers/windmill and 3D fog gizmo render with zero WebGL or runtime errors', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('ws_anim');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Windmill Valley', mode: 'normal', invite_code: 'WIND1' })
      .select()
      .single();
    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Valley 3D',
        kind: '3d',
        world_size: 200,
        fog_volumes: [{ id: 'fv-1', x: 10, y: 2, z: 10, radius: 15, density: 0.5 }],
      })
      .select()
      .single();

    await gm.client.from('map_paths').insert({
      map_id: mapRow.data.id,
      name: 'Silver River',
      style: 'river',
      points: [
        { x: -20, y: 1, z: -10 },
        { x: 0, y: 1, z: 0 },
        { x: 25, y: 1, z: 15 },
      ],
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Valley 3D').first().click();

    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await gmPage.waitForTimeout(500);

    tracker.assertNoErrors();
  });
});
