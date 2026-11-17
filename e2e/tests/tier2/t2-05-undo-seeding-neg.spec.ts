import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { createCampaignInHub, openProfileCampaignHub, openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-05 Negative & Boundary: Cloud Undo/Redo & Lazy Starter Seeding', () => {
  test('T2-021: Empty undo/redo stack is a safe no-op without errors or writes', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Blank World', mode: 'normal' }).select().single();
    const cid = world.data.id as string;

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });

    // Trigger Undo and Redo on empty stacks
    await gmPage.keyboard.press('Control+z');
    await gmPage.keyboard.press('Control+y');
    await gmPage.keyboard.press('Control+Shift+z');

    const entities = await gm.client.from('entities').select('*').eq('world_id', cid);
    expect(entities.data).toEqual([]);
    tracker.assertNoErrors();
  });

  test('T2-022: Player blocked from starter seeding and undoing GM-created records', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'GM Seeded Only', mode: 'normal', invite_code: 'SEED01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SEED01' });

    const ent = await gm.client
      .from('entities')
      .insert({ world_id: cid, slug: 'gm-anchor-spire', title: 'GM Anchor Spire', type: 'Location' })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);

    // Player presses Ctrl+Z -> cannot undo GM records; REST delete also blocked
    await playerAPage.keyboard.press('Control+z');
    await assertSupabaseRejected(
      playerA.client.from('entities').delete().eq('id', ent.data.id).select(),
      'Player deleting GM entity',
    );

    const checkEnt = await gm.client.from('entities').select('*').eq('id', ent.data.id).single();
    expect(checkEnt.data?.title).toBe('GM Anchor Spire');

    // Starter seed button should not be usable by player for GM campaign
    await openSidebarSection(playerAPage, 'Vault');
    await expect(playerAPage.getByRole('button', { name: /seed starter/i })).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-023: Transient network failure during cloud undo does not crash workspace', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Flaky Undo', mode: 'normal' }).select().single();
    const cid = world.data.id as string;

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');

    // Create an entity in UI if button available, else via REST + trigger edit
    const newBtn = gmPage.getByRole('button', { name: /new entity|add entity|create entity/i }).first();
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      const nameInput = gmPage.getByLabel(/name|title/i).or(gmPage.getByPlaceholder(/name|title/i)).first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Transient Tower');
        await gmPage.getByRole('button', { name: /save|create/i }).last().click();
      }
    } else {
      await gm.client.from('entities').insert({ world_id: cid, slug: 'transient-tower', title: 'Transient Tower', type: 'Location' });
    }

    // Abort REST writes temporarily during undo
    await gmPage.route('**/rest/v1/**', async (route) => {
      const m = route.request().method();
      if (m === 'DELETE' || m === 'PATCH' || m === 'POST') {
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    await gmPage.keyboard.press('Control+z');
    await expect(gmPage.locator('header')).toBeVisible();
    await gmPage.unroute('**/rest/v1/**');

    tracker.assertNoErrors();
  });

  test('T2-024: Rapid consecutive undo presses coalesce safely without corruption', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Rapid Undo World', mode: 'normal' }).select().single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });

    // Fire 5 rapid Ctrl+Z presses
    for (let i = 0; i < 5; i++) {
      await gmPage.keyboard.press('Control+z');
    }

    await expect(gmPage.locator('header')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-025: Storage 500 during lazy starter campaign seeding fails gracefully without crash', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    // Intercept Storage uploads with 500 Internal Server Error
    await gmPage.route('**/storage/v1/object/**', async (route) => {
      if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error', message: 'Simulated storage 500' }),
        });
      } else {
        await route.continue();
      }
    });

    await openProfileCampaignHub(gmPage);
    await createCampaignInHub(gmPage, { name: 'Failing Storage Seed', mode: 'normal', seedStarter: true });

    // App shell must remain alive without uncaught pageerror
    await expect(gmPage.locator('header').or(gmPage.getByText(/Failing Storage Seed/i).first())).toBeVisible({
      timeout: 15_000,
    });
    await gmPage.unroute('**/storage/v1/object/**');

    tracker.assertNoErrors();
  });
});
