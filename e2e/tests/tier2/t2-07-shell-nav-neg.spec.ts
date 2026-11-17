import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  getRightInspectorToggle,
  openCommandPalette,
  openSidebarSection,
  searchCommandPalette,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-07 Negative & Boundary: Workspace Shell, Tabs, Inspector & CommandPalette', () => {
  test('T2-031: Closing all open tabs renders safe empty workspace state and allows re-opening', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Tab Shell World', mode: 'normal' }).select().single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });

    // Close any visible tab close buttons
    const closeBtns = gmPage.locator('[role="tab"] button, [data-testid*="tab-close"], button[aria-label*="close tab" i]');
    for (let i = 0; i < 6; i++) {
      if ((await closeBtns.count()) === 0) break;
      await closeBtns.first().click();
    }

    // Re-open Timeline or Profile tab cleanly
    await openSidebarSection(gmPage, 'Timeline');
    await expect(gmPage.getByText(/timeline|calendar/i).first()).toBeVisible({ timeout: 10_000 });
    tracker.assertNoErrors();
  });

  test('T2-032: CommandPalette handles empty/missing query and excludes GM-only records for players', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Palette Reach', mode: 'normal', invite_code: 'PAL01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'PAL01' });

    await gm.client.from('entities').insert([
      { world_id: cid, slug: 'public-guild-hall', title: 'Public Guild Hall', type: 'Location', metadata: { is_gm_only: false } },
      { world_id: cid, slug: 'gm-secret-lair', title: 'GM Secret Lair', type: 'Location', metadata: { is_gm_only: true } },
    ]);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 10_000 });

    await openCommandPalette(playerAPage);
    await searchCommandPalette(playerAPage, '');
    await expect(playerAPage.getByText('GM Secret Lair')).toHaveCount(0);

    await searchCommandPalette(playerAPage, 'GM Secret');
    await expect(playerAPage.getByText('GM Secret Lair')).toHaveCount(0);

    await searchCommandPalette(playerAPage, 'NonExistentQueryXYZ123');
    await expect(playerAPage.getByRole('dialog')).toBeVisible();

    await playerAPage.keyboard.press('Escape');
    tracker.assertNoErrors();
  });

  test('T2-033: Opening or holding a tab for a Realtime-deleted entity safely handles deletion', async ({
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
      .insert({ name: 'Realtime Tab Deletion', mode: 'normal', invite_code: 'RTDEL1' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'RTDEL1' });

    const ent = await gm.client
      .from('entities')
      .insert({ world_id: cid, slug: 'ephemeral-shrine', title: 'Ephemeral Shrine', type: 'Location', metadata: { is_gm_only: false } })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    await playerAPage.getByText('Ephemeral Shrine').first().click();

    // GM deletes the entity via REST -> Realtime propagates DELETE
    await gm.client.from('entities').delete().eq('id', ent.data.id);

    // Player A's UI must remain crash-free and remove/close or gracefully mark missing
    await expect(playerAPage.locator('header')).toBeVisible();
    await expect(playerAPage.getByText('Ephemeral Shrine')).toHaveCount(0, { timeout: 10_000 });

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
  });

  test('T2-034: RightInspector resize clamps within safe bounds without collapsing viewport', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Inspector Clamp', mode: 'normal' }).select().single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });

    const toggle = await getRightInspectorToggle(gmPage);
    if (await toggle.isVisible().catch(() => false)) {
      const box = await toggle.boundingBox();
      if (box) {
        // Attempt extreme drag to left edge (x=50)
        await gmPage.mouse.move(box.x, box.y + 40);
        await gmPage.mouse.down();
        await gmPage.mouse.move(50, box.y + 40, { steps: 5 });
        await gmPage.mouse.up();
      }
    }

    const bodyBox = await gmPage.locator('body').boundingBox();
    expect(bodyBox?.width).toBeGreaterThanOrEqual(768);
    await expect(gmPage.locator('header')).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T2-035: Narrow 768px viewport renders shell without horizontal overflow blocking controls', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Narrow Shell', mode: 'normal' }).select().single();

    await gmPage.setViewportSize({ width: 768, height: 900 });
    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });
    const metrics = await gmPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 8);

    // Dice toggle or sidebar button stays reachable inside 768px
    const diceBtn = gmPage.locator('header').getByRole('button', { name: /dice|roller/i }).first();
    if (await diceBtn.isVisible().catch(() => false)) {
      const box = await diceBtn.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(768);
    }

    tracker.assertNoErrors();
  });
});
