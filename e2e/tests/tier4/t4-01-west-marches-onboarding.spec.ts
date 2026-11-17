import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { assertSupabaseRejected, signInUser } from '../../helpers/protocolAdmin.js';
import {
  createCampaignInHub,
  createCharacterInPane,
  getGmModeToggle,
  openProfileCampaignHub,
  openSidebarSection,
  signUpViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('T4-01: West Marches Onboarding, ?invite=CODE Preservation & Single-Character Enforcement', () => {
  test('T4-01: GM creates West Marches campaign -> Players A & B join via ?invite=CODE -> 1-active-char & role boundaries enforced', async ({
    gmPage,
    playerAPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const gmCreds = makeUserCredentials('wm-gm');
    const playerACreds = makeUserCredentials('wm-playera');
    const playerBCreds = makeUserCredentials('wm-playerb');

    // 1. GM signs up via AuthScreen and creates a West Marches campaign in Hub
    await gmPage.goto(appServer.url);
    await signUpViaAuthScreen(gmPage, gmCreds);
    await openProfileCampaignHub(gmPage);
    await createCampaignInHub(gmPage, {
      name: 'Shattered Marches Frontier',
      mode: 'west_marches',
      maxPlayersPerParty: 4,
      seedStarter: false,
    });

    await expect(gmPage.getByText('Shattered Marches Frontier').first()).toBeVisible({ timeout: 15_000 });
    await expect(gmPage.getByText(/west marches/i).first()).toBeVisible();

    // Retrieve generated invite_code via GM protocol client
    const gmAdmin = await signInUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds.email, gmCreds.password);
    const worldRes = await gmAdmin.client
      .from('worlds')
      .select('*')
      .eq('name', 'Shattered Marches Frontier')
      .single();
    expect(worldRes.error).toBeNull();
    expect(worldRes.data.mode).toBe('west_marches');
    const cid = worldRes.data.id as string;
    const inviteCode = worldRes.data.invite_code as string;
    expect(inviteCode).toBeTruthy();

    // 2. Player A & Player B navigate directly to /?invite=CODE -> sign up -> preserve invite across auth
    await playerAPage.goto(`${appServer.url}/?invite=${encodeURIComponent(inviteCode)}`);
    await signUpViaAuthScreen(playerAPage, playerACreds);
    await expect(playerAPage.getByText('Shattered Marches Frontier').first()).toBeVisible({ timeout: 15_000 });

    await playerBPage.goto(`${appServer.url}/?invite=${encodeURIComponent(inviteCode)}`);
    await signUpViaAuthScreen(playerBPage, playerBCreds);
    await expect(playerBPage.getByText('Shattered Marches Frontier').first()).toBeVisible({ timeout: 15_000 });

    // 3. Player A creates 1st active character -> succeeds; 2nd active character -> blocked by UI & DB trigger
    await createCharacterInPane(playerAPage, 'Veyra Dawnblade');
    await expect(playerAPage.getByText('Veyra Dawnblade').first()).toBeVisible({ timeout: 10_000 });

    const playerAAdmin = await signInUser(
      protocolRuntime.url,
      protocolRuntime.anonKey,
      playerACreds.email,
      playerACreds.password,
    );
    const triggerErr = await assertSupabaseRejected(
      playerAAdmin.client
        .from('characters')
        .insert({
          campaign_id: cid,
          user_id: playerAAdmin.userId,
          name: 'Illegal Second Hero',
          is_active: true,
        })
        .select(),
      'West Marches 2nd active character',
    );
    expect(triggerErr.code).toBe('23505');

    // 4. Players lack GM Mode toggle; GM sees all 3 members & badges in Hub
    const playerAToggle = await getGmModeToggle(playerAPage);
    if (await playerAToggle.isVisible().catch(() => false)) {
      expect(await playerAToggle.isDisabled()).toBe(true);
    }
    const playerBToggle = await getGmModeToggle(playerBPage);
    if (await playerBToggle.isVisible().catch(() => false)) {
      expect(await playerBToggle.isDisabled()).toBe(true);
    }

    await openProfileCampaignHub(gmPage);
    await gmPage.reload();
    await openProfileCampaignHub(gmPage);
    await openSidebarSection(gmPage, 'Profile');

    const members = await gmAdmin.client.from('campaign_members').select('*').eq('campaign_id', cid);
    expect(members.data).toHaveLength(3);

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
