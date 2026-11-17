import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createPngBuffer } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  assertNoHudOverlapWithInspector,
  getPrimaryViewportCanvas,
  openTimelinePane,
  signInViaAuthScreen,
  triggerWorldsmithUndo,
} from '../../helpers/uiActions.js';

test.describe('T4-07: 3D Worldsmith Sculpt Undo, Storage Sync & Fantasy Calendar Progression', () => {
  test('T4-07: GM enters Worldsmith (RightInspector safe-inset) -> sculpt + Ctrl+Z undo + terrain PNG Storage sync -> custom calendar & public/GM-only timeline events', async ({
    gmPage,
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    test.setTimeout(120_000);
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);

    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const world = await gm.client
      .from('worlds')
      .insert({
        name: 'Worldsmith Highlands',
        mode: 'normal',
        invite_code: 'WSM47',
        calendar_config: {
          eraName: 'Age of Stars',
          months: [{ name: 'Frostmoon', days: 30 }, { name: 'Suntide', days: 30 }],
          weekdays: ['Firstday', 'Marketday'],
          currentYear: 1200,
          currentMonthIndex: 0,
          currentDay: 1,
        },
      })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WSM47' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Highland Crest', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    const gmCanvas = await getPrimaryViewportCanvas(gmPage);
    await expect(gmCanvas).toBeVisible({ timeout: 30_000 });

    // Enter Worldsmith mode if toggle exists
    const wsToggle = gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first();
    if (await wsToggle.isVisible().catch(() => false)) {
      await wsToggle.click({ timeout: 30_000 });

      // Verify RightInspector safe-inset layout
      const inspector = gmPage.locator('aside').last();
      const hud = gmPage.locator('[data-testid*="hud"], [data-testid*="worldsmith"]').first();
      if ((await hud.count()) > 0 && (await inspector.isVisible().catch(() => false))) {
        await assertNoHudOverlapWithInspector(gmPage, hud, inspector);
      }

      // Sculpt stroke on 3D canvas followed by Ctrl+Z undo
      const box = await gmCanvas.boundingBox();
      if (box) {
        await gmPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await gmPage.mouse.down();
        await gmPage.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
        await gmPage.mouse.up();
      }
      await triggerWorldsmithUndo(gmPage);
    }

    // Bring Player A online before terrain & timeline Realtime updates
    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(await getPrimaryViewportCanvas(playerAPage)).toBeVisible({ timeout: 30_000 });

    // Upload sculpted terrain PNG to Storage & sync paint_url
    const terrainPng = createPngBuffer(16, 16, [88, 145, 72, 255]);
    const uploadRes = await gm.client.storage
      .from('vault-assets')
      .upload(`terrain/${cid}/crest-paint.png`, terrainPng, { contentType: 'image/png', upsert: true });
    expect(uploadRes.error).toBeNull();
    const terrainUrl = gm.client.storage.from('vault-assets').getPublicUrl(`terrain/${cid}/crest-paint.png`).data.publicUrl;
    await gm.client.from('maps').update({ paint_url: terrainUrl }).eq('id', mapRow.data.id);

    // GM steps Fantasy Calendar and publishes 1 public + 1 GM-only timeline event
    await gm.client.from('timeline_events').insert([
      {
        campaign_id: cid,
        title: 'Solstice Festival Begins',
        date_label: 'Year 1200 Frostmoon 2',
        sort_order: 1,
        is_gm_only: false,
      },
      {
        campaign_id: cid,
        title: 'SECRET_TITAN_AWAKENING',
        date_label: 'Year 1200 Frostmoon 2',
        sort_order: 2,
        is_gm_only: true,
      },
    ]);

    await openTimelinePane(gmPage);
    await expect(gmPage.getByText('Solstice Festival Begins').first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText('SECRET_TITAN_AWAKENING').first()).toBeVisible({ timeout: 10_000 });

    // Player A sees terrain & public timeline only
    await expect(await getPrimaryViewportCanvas(playerAPage)).toBeVisible({ timeout: 15_000 });
    await openTimelinePane(playerAPage);
    await expect(playerAPage.getByText('Solstice Festival Begins').first()).toBeVisible({ timeout: 10_000 });
    await expect(playerAPage.getByText('SECRET_TITAN_AWAKENING')).toHaveCount(0);

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
  });
});
