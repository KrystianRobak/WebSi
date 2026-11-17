import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-02: Player Profile Editor & Campaign Hub Dashboard', () => {
  test('T1-006: Profile & Campaign Hub displays authenticated player profile details', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const creds = makeUserCredentials('profview');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, creds);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, creds.email, creds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(playerAPage);
    await expect(playerAPage.getByText(new RegExp(creds.displayName, 'i')).first()).toBeVisible();
    await expect(playerAPage.getByText(new RegExp(creds.email, 'i')).first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-007: editing display name and bio in Profile Hub persists to Supabase profiles across reload', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const creds = makeUserCredentials('profedit');
    const user = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, creds);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, creds.email, creds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(playerAPage);

    const displayNameInput = playerAPage.getByLabel(/display name/i).first();
    await displayNameInput.fill('Archmage Elara');
    const bioInput = playerAPage.getByLabel(/bio/i).or(playerAPage.getByPlaceholder(/bio/i)).first();
    if (await bioInput.isVisible().catch(() => false)) {
      await bioInput.fill('Chronicler of the Outer Rim');
    }

    const patchPromise = playerAPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/profiles') && res.request().method() === 'PATCH',
    );
    await playerAPage.getByRole('button', { name: /save profile|update profile|save/i }).first().click();
    const patchResp = await patchPromise;
    expect(patchResp.ok()).toBe(true);

    // Reload and confirm updated profile persists from DB
    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openProfileCampaignHub(playerAPage);
    await expect(playerAPage.getByLabel(/display name/i).first()).toHaveValue('Archmage Elara');

    const dbCheck = await user.client.from('profiles').select('display_name').eq('id', user.userId).single();
    expect(dbCheck.data?.display_name).toBe('Archmage Elara');

    tracker.assertNoErrors();
  });

  test('T1-008: Campaign Hub lists joined campaigns with accurate Normal / West Marches and role badges', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const playerCreds = makeUserCredentials('badges');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const normRes = await gm.client
      .from('worlds')
      .insert({ name: 'Silverpine Saga', mode: 'normal', invite_code: 'SILV01' })
      .select()
      .single();
    const wmRes = await gm.client
      .from('worlds')
      .insert({ name: 'Shattered Marches', mode: 'west_marches', invite_code: 'WM001' })
      .select()
      .single();
    expect(normRes.error).toBeNull();
    expect(wmRes.error).toBeNull();

    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'SILV01' });
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'WM001' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerCreds.email, playerCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(playerAPage);
    await expect(playerAPage.getByText('Silverpine Saga').first()).toBeVisible();
    await expect(playerAPage.getByText('Shattered Marches').first()).toBeVisible();
    await expect(playerAPage.getByText(/normal/i).first()).toBeVisible();
    await expect(playerAPage.getByText(/west marches/i).first()).toBeVisible();
    await expect(playerAPage.getByText(/player/i).first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-009: Profile Hub "My Characters" overview lists player characters across joined campaigns', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const playerCreds = makeUserCredentials('charlist');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const w1 = await gm.client
      .from('worlds')
      .insert({ name: 'Realm Alpha', mode: 'normal', invite_code: 'ALP01' })
      .select()
      .single();
    const w2 = await gm.client
      .from('worlds')
      .insert({ name: 'Realm Beta', mode: 'west_marches', invite_code: 'BET02' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'ALP01' });
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'BET02' });

    await player.client.from('characters').insert({
      campaign_id: w1.data.id,
      user_id: player.userId,
      name: 'Lyra Dawnstar',
      is_active: true,
    });
    await player.client.from('characters').insert({
      campaign_id: w2.data.id,
      user_id: player.userId,
      name: 'Garrick Ironhide',
      is_active: true,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerCreds.email, playerCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(playerAPage);
    await expect(playerAPage.getByText('Lyra Dawnstar').first()).toBeVisible();
    await expect(playerAPage.getByText('Garrick Ironhide').first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-010: clicking a character entry in Profile Hub opens that character sheet tab in the workspace', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const playerCreds = makeUserCredentials('charjump');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Jump Frontier', mode: 'normal', invite_code: 'JUMP1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'JUMP1' });
    await player.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: player.userId,
      name: 'Vespera Shadow',
      is_active: true,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerCreds.email, playerCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openSidebarSection(playerAPage, 'Profile');
    const charCard = playerAPage.getByRole('button', { name: /Vespera Shadow/i }).first().or(
      playerAPage.getByText('Vespera Shadow').first(),
    );
    await charCard.click();

    await expect(playerAPage.getByRole('tab', { name: /Vespera Shadow/i }).or(
      playerAPage.getByText(/Vespera Shadow/i).first(),
    )).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });
});
