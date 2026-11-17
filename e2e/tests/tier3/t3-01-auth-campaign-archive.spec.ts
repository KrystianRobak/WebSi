import fs from 'node:fs/promises';
import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createValidCampaignArchiveV2, makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  createCampaignInHub,
  getGmModeToggle,
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
  signUpViaAuthScreen,
  switchCampaignInHeader,
} from '../../helpers/uiActions.js';

test.describe('Tier 3 Pairwise Integration: Auth, Campaigns, Members & JSON Archive (T3-01..T3-06)', () => {
  test('T3-01: [UF-01 x UF-03] ?invite=CODE preserved across signup auto-joins West Marches campaign and survives reload', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm1'));
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Borderland Guild', mode: 'west_marches', invite_code: 'WMJOIN7' })
      .select()
      .single();

    const pCreds = makeUserCredentials('t3_inv');
    await playerAPage.goto(`${appServer.url}/?invite=WMJOIN7`);
    await signUpViaAuthScreen(playerAPage, pCreds);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Borderland Guild').first()).toBeVisible({ timeout: 15_000 });

    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(playerAPage.getByText('Borderland Guild').first()).toBeVisible({ timeout: 15_000 });

    const mems = await gm.client.from('campaign_members').select('role').eq('campaign_id', world.data.id);
    expect(mems.data).toHaveLength(2);

    tracker.assertNoErrors();
  });

  test('T3-02: [UF-02 x UF-04] Player edits Profile display name, joins campaign, and receives co_gm promotion + GM toggle', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_gm2');
    const pCreds = makeUserCredentials('t3_p2');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Council Keep', mode: 'normal', invite_code: 'CNCL2' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'CNCL2' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openProfileCampaignHub(playerAPage);
    await playerAPage.getByLabel(/display name/i).first().fill('Lady Seraphina');
    await playerAPage.getByRole('button', { name: /save profile|update profile|save/i }).first().click();
    await expect(await getGmModeToggle(playerAPage)).not.toBeVisible();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openProfileCampaignHub(gmPage);
    await expect(gmPage.getByText('Lady Seraphina').first()).toBeVisible({ timeout: 10_000 });

    const roleSelect = gmPage.getByRole('combobox', { name: /Role for Lady Seraphina/i }).first();
    await roleSelect.selectOption('co_gm');

    await expect
      .poll(async () => (await gm.client.from('campaign_members').select('role').eq('campaign_id', world.data.id).eq('user_id', player.userId).single()).data?.role)
      .toBe('co_gm');

    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(await getGmModeToggle(playerAPage)).toBeVisible({ timeout: 15_000 });

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });

  test('T3-03: [UF-03 x UF-06] Export Normal campaign JSON -> Import UUID-remapped copy -> Switch cleanly in TopHeader', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }, testInfo) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_exp');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    const w1 = await gm.client
      .from('worlds')
      .insert({ name: 'Original Coast', mode: 'normal', invite_code: 'ORIGC' })
      .select()
      .single();
    await gm.client.from('entities').insert({
      world_id: w1.data.id,
      slug: 'coastal-beacon',
      title: 'Coastal Beacon',
      type: 'Location',
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Coastal Beacon').first()).toBeVisible({ timeout: 15_000 });

    const dlPromise = gmPage.waitForEvent('download');
    await gmPage.locator('header').getByRole('button', { name: /export campaign/i }).first().click();
    await gmPage.getByRole('button', { name: /export archive v2 json/i }).first().click();
    const dl = await dlPromise;
    const exportedJson = JSON.parse(await fs.readFile((await dl.path())!, 'utf8')) as Record<string, unknown>;
    (exportedJson.campaign as Record<string, unknown>).name = 'Cloned Coast';
    const clonePath = testInfo.outputPath('cloned-coast.json');
    await fs.writeFile(clonePath, JSON.stringify(exportedJson), 'utf8');

    await openProfileCampaignHub(gmPage);
    await gmPage.locator('input[type="file"][accept*="json"]').first().setInputFiles(clonePath);
    await expect(gmPage.getByText('Cloned Coast').first()).toBeVisible({ timeout: 15_000 });

    await switchCampaignInHeader(gmPage, 'Original Coast');
    await openSidebarSection(gmPage, 'Vault');
    await expect(gmPage.getByText('Coastal Beacon').first()).toBeVisible();
    await switchCampaignInHeader(gmPage, 'Cloned Coast');
    await openSidebarSection(gmPage, 'Vault');
    await expect(gmPage.getByText('Coastal Beacon').first()).toBeVisible();

    const worlds = await gm.client.from('worlds').select('id, name');
    expect(worlds.data).toHaveLength(2);

    tracker.assertNoErrors();
  });

  test('T3-04: [UF-05 x UF-06] Seed starter campaign -> Import archive w/ data: URL -> Cloud Undo/Redo on imported entity', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }, testInfo) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_seedimp');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openProfileCampaignHub(gmPage);
    await createCampaignInHub(gmPage, { name: 'Seeded Origin', mode: 'normal', seedStarter: true });
    await expect(gmPage.getByText('Seeded Origin').first()).toBeVisible({ timeout: 15_000 });

    const archive = createValidCampaignArchiveV2({ name: 'Imported Paint World', includeDataUrlImage: true });
    const archivePath = testInfo.outputPath('paint-archive.json');
    await fs.writeFile(archivePath, JSON.stringify(archive), 'utf8');

    const storageUpload = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    await gmPage.locator('input[type="file"][accept*="json"]').first().setInputFiles(archivePath);
    expect((await storageUpload).ok()).toBe(true);

    await openSidebarSection(gmPage, 'Vault');
    await expect(gmPage.getByText('Aldric the Bold').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Aldric the Bold').first().click();

    const editSplitBtn = gmPage.getByRole('button', { name: /edit in split/i }).first();
    if (await editSplitBtn.isVisible().catch(() => false)) {
      await editSplitBtn.click();
    }
    const nameInput = gmPage.getByLabel('Entry Title').first();
    await nameInput.fill('Aldric the Renamed');
    await nameInput.blur();

    const importedWorld = (await gm.client.from('worlds').select('id').ilike('name', 'Imported Paint World%').single()).data!;
    await expect
      .poll(async () => (await gm.client.from('entities').select('title').eq('world_id', importedWorld.id).single()).data?.title)
      .toBe('Aldric the Renamed');

    await gmPage.getByRole('button', { name: /undo/i }).first().click();
    await expect
      .poll(async () => (await gm.client.from('entities').select('title').eq('world_id', importedWorld.id).single()).data?.title)
      .toBe('Aldric the Bold');

    tracker.assertNoErrors();
  });

  test('T3-05: [UF-03 x UF-20] Multi-campaign switching isolates Normal and West Marches records across members', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm5'));
    const pACreds = makeUserCredentials('t3_p5a');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);

    const wA = await gm.client.from('worlds').insert({ name: 'Alpha Normal', mode: 'normal', invite_code: 'ALPH5' }).select().single();
    const wB = await gm.client.from('worlds').insert({ name: 'Beta Marches', mode: 'west_marches', invite_code: 'BETA5' }).select().single();
    const wSecret = await gm.client.from('worlds').insert({ name: 'Gamma Secret', mode: 'normal', invite_code: 'GAMM5' }).select().single();

    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'ALPH5' });
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'BETA5' });

    await gm.client.from('entities').insert([
      { world_id: wA.data.id, slug: 'alpha-relic', title: 'Alpha Relic', type: 'Item' },
      { world_id: wB.data.id, slug: 'beta-relic', title: 'Beta Relic', type: 'Item' },
      { world_id: wSecret.data.id, slug: 'gamma-excluded', title: 'Gamma Excluded', type: 'Item' },
    ]);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await switchCampaignInHeader(playerAPage, 'Alpha Normal');
    await expect(playerAPage.getByText('Alpha Relic').first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Beta Relic')).not.toBeVisible();
    await expect(playerAPage.getByText('Gamma Excluded')).not.toBeVisible();

    await switchCampaignInHeader(playerAPage, 'Beta Marches');
    await expect(playerAPage.getByText('Beta Relic').first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Alpha Relic')).not.toBeVisible();

    tracker.assertNoErrors();
  });

  test('T3-06: [UF-01 x UF-07 x UF-20] Sign out with open tabs clears workspace state before new user signs in', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const u1Creds = makeUserCredentials('t3_u1');
    const u2Creds = makeUserCredentials('t3_u2');
    const u1 = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, u1Creds);
    const u2 = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, u2Creds);

    const w1 = await u1.client.from('worlds').insert({ name: 'User1 Realm', mode: 'normal', invite_code: 'U1R01' }).select().single();
    await u1.client.from('entities').insert({ world_id: w1.data.id, slug: 'user1-secret-lore', title: 'User1 Secret Lore', type: 'Lore' });

    const w2 = await u2.client.from('worlds').insert({ name: 'User2 Realm', mode: 'normal', invite_code: 'U2R01' }).select().single();
    await u2.client.from('entities').insert({ world_id: w2.data.id, slug: 'user2-clean-lore', title: 'User2 Clean Lore', type: 'Lore' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, u1Creds.email, u1Creds.password);
    await expect(gmPage.getByText('User1 Secret Lore').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('User1 Secret Lore').first().click();
    await openSidebarSection(gmPage, 'Timeline');

    await gmPage.getByRole('button', { name: /sign out|log out/i }).first().click();
    await expect(gmPage.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 15_000 });

    await signInViaAuthScreen(gmPage, u2Creds.email, u2Creds.password);
    await expect(gmPage.getByText('User2 Clean Lore').first()).toBeVisible({ timeout: 15_000 });
    await expect(gmPage.getByText('User1 Secret Lore')).not.toBeVisible();

    tracker.assertNoErrors();
  });
});
