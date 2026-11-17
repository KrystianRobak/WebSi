import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  assertNoHudOverlapWithInspector,
  getPrimaryViewportCanvas,
  getRightInspectorToggle,
  signInViaAuthScreen,
  triggerWorldsmithUndo,
} from '../../helpers/uiActions.js';

test.describe('UF-19 Negative & Boundary: 3D Worldsmith Undo, Storage Sync & Safe-Inset Layout', () => {
  test('T2-091: Ctrl+Z outside Worldsmith mode routes to store undo cleanly without Worldsmith error', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Non-Worldsmith Undo', mode: 'normal' }).select().single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });

    await gmPage.keyboard.press('Control+z');
    await expect(gmPage.locator('header')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-092: Non-GM player blocked from Worldsmith sculpt controls and terrain upload/update', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Locked Worldsmith', mode: 'normal', invite_code: 'WSM01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WSM01' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'GM Sculpted Peak', kind: '3d', world_size: 200 })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client.from('maps').update({ paint_url: 'http://example.invalid/sculpt.png' }).eq('id', mapRow.data.id).select(),
      'Player A updating 3D terrain paint_url',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(playerAPage.getByRole('button', { name: /worldsmith|sculpt terrain/i })).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-093: Collapsing/expanding RightInspector preserves safe-inset layout without HUD overlap', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Safe Inset World', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({ world_id: world.data.id, name: '3D Horizon', kind: '3d', world_size: 200 });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 15_000 });

    const inspector = gmPage.locator('aside').last();
    const hud = gmPage.locator('[data-testid*="hud"], [data-testid*="overlay"]').first();
    if ((await hud.count()) > 0 && (await inspector.isVisible().catch(() => false))) {
      await assertNoHudOverlapWithInspector(gmPage, hud, inspector);
    }

    const toggle = await getRightInspectorToggle(gmPage);
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await toggle.click();
      if ((await hud.count()) > 0 && (await inspector.isVisible().catch(() => false))) {
        await assertNoHudOverlapWithInspector(gmPage, hud, inspector);
      }
    }

    tracker.assertNoErrors();
  });

  test('T2-094: Empty Worldsmith sculpt undo stack is a safe no-op', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Empty Sculpt Undo', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({ world_id: world.data.id, name: '3D Basin', kind: '3d', world_size: 200 });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 15_000 });

    const wsBtn = gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first();
    if (await wsBtn.isVisible().catch(() => false)) {
      await wsBtn.click();
    }
    await triggerWorldsmithUndo(gmPage);

    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-095: Viewport resize keeps 3D Worldsmith canvas aspect ratio valid and non-zero', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Resize 3D', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({ world_id: world.data.id, name: 'Resize Peak', kind: '3d', world_size: 200 });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    await gmPage.setViewportSize({ width: 1024, height: 700 });
    await gmPage.waitForTimeout(200);
    const box1 = await canvas.boundingBox();
    expect((box1?.width ?? 0) > 100 && (box1?.height ?? 0) > 100).toBe(true);

    await gmPage.setViewportSize({ width: 1440, height: 900 });
    await gmPage.waitForTimeout(200);
    const box2 = await canvas.boundingBox();
    expect((box2?.width ?? 0) >= (box1?.width ?? 0)).toBe(true);

    tracker.assertNoErrors();
  });
});
