import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  createCampaignInHub,
  openProfileCampaignHub,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-05: Cloud Undo/Redo & Lazy Starter Campaign Seeding', () => {
  test('T1-021: creating a campaign with starter seed uploads terrain PNGs to Storage and creates lore', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('seedgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    const storageUploadPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    await createCampaignInHub(gmPage, {
      name: 'Seeded Realm',
      mode: 'normal',
      seedStarter: true,
    });
    const uploadResp = await storageUploadPromise;
    expect(uploadResp.ok()).toBe(true);

    let seededWorldId = '';
    await expect
      .poll(async () => {
        const res = await gm.client.from('worlds').select('id').eq('name', 'Seeded Realm').maybeSingle();
        seededWorldId = res.data?.id ?? '';
        return Boolean(seededWorldId);
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const entitiesRes = await gm.client.from('entities').select('id').eq('world_id', seededWorldId);
        return (entitiesRes.data ?? []).length;
      })
      .toBeGreaterThan(0);

    tracker.assertNoErrors();
  });

  test('T1-022: creating a campaign without starter seed starts completely empty with zero seed entities', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('emptygm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    await createCampaignInHub(gmPage, {
      name: 'Blank Canvas',
      mode: 'west_marches',
      seedStarter: false,
    });

    await expect(gmPage.getByText('Blank Canvas').first()).toBeVisible({ timeout: 10_000 });

    const worldRes = await gm.client.from('worlds').select('id').eq('name', 'Blank Canvas').single();
    expect(worldRes.error).toBeNull();
    const entitiesRes = await gm.client.from('entities').select('id').eq('world_id', worldRes.data!.id);
    expect(entitiesRes.data).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T1-023: cloud Undo reverts entity mutation in both UI and Supabase database', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('undogm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Undo Citadel', mode: 'normal', invite_code: 'UNDO1' })
      .select()
      .single();
    const entity = await gm.client
      .from('entities')
      .insert({ world_id: world.data.id, slug: 'original-name', title: 'Original Name', type: 'NPC', summary: 'Initial' })
      .select()
      .single();
    expect(entity.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByRole('heading', { name: 'Original Name' })).toBeVisible({ timeout: 15_000 });

    await gmPage.getByRole('button', { name: /edit in split/i }).click();
    const titleInput = gmPage.getByLabel('Entry Title').first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Mutated Name');
    await titleInput.blur();

    await expect
      .poll(async () => {
        const res = await gm.client.from('entities').select('title').eq('id', entity.data.id).single();
        return res.data?.title;
      })
      .toBe('Mutated Name');

    const undoBtn = gmPage.getByRole('button', { name: /undo/i }).first();
    await undoBtn.click();

    await expect
      .poll(async () => {
        const res = await gm.client.from('entities').select('title').eq('id', entity.data.id).single();
        return res.data?.title;
      })
      .toBe('Original Name');

    tracker.assertNoErrors();
  });

  test('T1-024: cloud Redo reapplies reverted entity mutation to UI and Supabase database', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('redogm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Redo Keep', mode: 'normal', invite_code: 'REDO1' })
      .select()
      .single();
    const entity = await gm.client
      .from('entities')
      .insert({ world_id: world.data.id, slug: 'alpha-tower', title: 'Alpha Tower', type: 'Location' })
      .select()
      .single();
    expect(entity.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByRole('heading', { name: 'Alpha Tower' })).toBeVisible({ timeout: 15_000 });

    await gmPage.getByRole('button', { name: /edit in split/i }).click();
    const titleInput = gmPage.getByLabel('Entry Title').first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Omega Spire');
    await titleInput.blur();

    await expect
      .poll(async () => (await gm.client.from('entities').select('title').eq('id', entity.data.id).single()).data?.title)
      .toBe('Omega Spire');

    await gmPage.getByRole('button', { name: /undo/i }).first().click();
    await expect
      .poll(async () => (await gm.client.from('entities').select('title').eq('id', entity.data.id).single()).data?.title)
      .toBe('Alpha Tower');

    await gmPage.getByRole('button', { name: /redo/i }).first().click();
    await expect
      .poll(async () => (await gm.client.from('entities').select('title').eq('id', entity.data.id).single()).data?.title)
      .toBe('Omega Spire');

    tracker.assertNoErrors();
  });

  test('T1-025: booting app as authenticated user with zero campaigns does not auto-seed starter campaign', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const creds = makeUserCredentials('noseed');
    const user = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, creds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, creds.email, creds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    // Confirm no worlds or entities were auto-created on boot
    await gmPage.waitForTimeout(400);
    const worlds = await user.client.from('worlds').select('id');
    expect(worlds.data).toEqual([]);
    const entities = await user.client.from('entities').select('id');
    expect(entities.data).toEqual([]);

    tracker.assertNoErrors();
  });
});
