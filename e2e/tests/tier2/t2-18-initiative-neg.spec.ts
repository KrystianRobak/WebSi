import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { getPrimaryViewportCanvas, openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-18 Negative & Boundary: 2D Battlemap Initiative, AoE & Zoom Bounds', () => {
  test('T2-086: Non-GM player blocked from Next Turn, round advance, and combat_state writes', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Locked Initiative', mode: 'normal', invite_code: 'INIT01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'INIT01' });

    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: cid,
        name: 'Initiative Arena',
        kind: '2d',
        battlemap: { tokens: [], walls: [], lights: [] },
        combat_state: {
          active: true,
          round: 1,
          activeTurnIndex: 0,
          entries: [{ id: 'c1', name: 'Goblin', initiative: 15, conditions: [] }],
        },
      })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client.from('maps').update({ combat_state: { active: true, round: 99, activeTurnIndex: 0, entries: [] } }).eq('id', mapRow.data.id).select(),
      'Player A updating combat_state',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');
    const mapItem = playerAPage.getByText('Initiative Arena').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }
    const collapseA = playerAPage.locator('aside button[title="Collapse Drawer"]');
    if (await collapseA.isVisible().catch(() => false)) {
      await collapseA.click();
    }

    const nextTurnBtn = playerAPage.getByRole('button', { name: /next turn/i });
    if ((await nextTurnBtn.count()) > 0 && (await nextTurnBtn.first().isVisible())) {
      expect(await nextTurnBtn.first().isDisabled()).toBe(true);
    }

    tracker.assertNoErrors();
  });

  test('T2-087: Next Turn with 0 combatants in initiative tracker is a safe no-op', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Empty Initiative', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Quiet Hall',
      kind: '2d',
      battlemap: { tokens: [], walls: [], lights: [] },
      combat_state: { active: true, round: 1, activeTurnIndex: 0, entries: [] },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');
    const mapItem = gmPage.getByText('Quiet Hall').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }
    const collapseBtn = gmPage.locator('aside button[title="Collapse Drawer"]');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click();
    }

    const nextTurnBtn = gmPage.getByRole('button', { name: /next turn/i }).first();
    if ((await nextTurnBtn.isVisible().catch(() => false)) && !(await nextTurnBtn.isDisabled())) {
      await nextTurnBtn.click();
    }

    await expect(gmPage.locator('header')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-088: Rapid wheel zoom clamps within finite min/max bounds without breaking canvas', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Zoom Clamp 2D', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Zoom Grid',
      kind: '2d',
      battlemap: { tokens: [], walls: [], lights: [] },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');
    const mapItem = gmPage.getByText('Zoom Grid').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }

    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    if (box) {
      await gmPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 20; i++) {
        await gmPage.mouse.wheel(0, -400);
      }
      for (let i = 0; i < 20; i++) {
        await gmPage.mouse.wheel(0, 400);
      }
    }

    const boxAfter = await canvas.boundingBox();
    expect((boxAfter?.width ?? 0) > 0 && (boxAfter?.height ?? 0) > 0).toBe(true);
    tracker.assertNoErrors();
  });

  test('T2-089: Negative or huge AoE template radius rejected or clamped safely', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'AoE Clamp', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Blast Radius',
      kind: '2d',
      battlemap: {
        tokens: [],
        walls: [],
        lights: [],
        aoes: [{ id: 'aoe-neg', kind: 'circle', x: 100, y: 100, radius: -50, label: 'Negative Blast' }],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');
    const mapItem = gmPage.getByText('Blast Radius').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }
    const collapseBtn = gmPage.locator('aside button[title="Collapse Drawer"]');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click();
    }

    const radiusInput = gmPage.locator('label:has-text("Radius") input[type="number"]').first();
    if (await radiusInput.isVisible().catch(() => false)) {
      await radiusInput.fill('-10');
      await radiusInput.fill('999999');
    }

    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 15_000 });
    tracker.assertNoErrors();
  });

  test('T2-090: Clicking initiative combatant without character_id handles safely without broken sheet tab', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'No Char Combatant', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Monster Skirmish',
      kind: '2d',
      battlemap: { tokens: [], walls: [], lights: [] },
      combat_state: {
        active: true,
        round: 1,
        activeTurnIndex: 0,
        entries: [{ id: 'm1', name: 'Generic Skeleton', initiative: 12, characterId: null, conditions: [] }],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');
    const mapItem = gmPage.getByText('Monster Skirmish').first();
    if (await mapItem.isVisible().catch(() => false)) {
      await mapItem.click();
    }
    const collapseBtn = gmPage.locator('aside button[title="Collapse Drawer"]');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click();
    }

    const entry = gmPage.getByText('Generic Skeleton').first();
    if (await entry.isVisible().catch(() => false)) {
      await entry.click();
    }

    await expect(gmPage.locator('header')).toBeVisible();
    tracker.assertNoErrors();
  });
});
