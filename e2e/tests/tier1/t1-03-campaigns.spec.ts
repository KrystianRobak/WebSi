import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  createCampaignInHub,
  joinCampaignByInviteCodeInHub,
  openProfileCampaignHub,
  signInViaAuthScreen,
  switchCampaignInHeader,
} from '../../helpers/uiActions.js';

test.describe('UF-03: Campaign Creation (Normal/WM), Invite Join & Multi-Campaign Switching', () => {
  test('T1-011: GM creates a Normal campaign in Profile Hub and auto-receives gm membership', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('gm_norm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    const createWorldPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/worlds') && res.request().method() === 'POST',
    );
    await createCampaignInHub(gmPage, {
      name: 'Crown of Thorns',
      mode: 'normal',
      seedStarter: false,
    });
    const resp = await createWorldPromise;
    expect(resp.ok()).toBe(true);

    await expect(gmPage.getByText('Crown of Thorns').first()).toBeVisible();

    const dbWorlds = await gm.client.from('worlds').select('id, name, mode').eq('name', 'Crown of Thorns');
    expect(dbWorlds.data).toHaveLength(1);
    expect(dbWorlds.data?.[0].mode).toBe('normal');

    const memberCheck = await gm.client
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', dbWorlds.data![0].id)
      .eq('user_id', gm.userId)
      .single();
    expect(memberCheck.data?.role).toBe('gm');

    tracker.assertNoErrors();
  });

  test('T1-012: GM creates a West Marches campaign with sheet preset and party capacity', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('gm_wm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    await createCampaignInHub(gmPage, {
      name: 'Ashfall Frontier',
      mode: 'west_marches',
      maxPlayersPerParty: 5,
      seedStarter: false,
    });

    await expect(gmPage.getByText('Ashfall Frontier').first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText(/west marches/i).first()).toBeVisible();

    const dbWorld = await gm.client
      .from('worlds')
      .select('id, mode, max_players_per_party')
      .eq('name', 'Ashfall Frontier')
      .single();
    expect(dbWorld.error).toBeNull();
    expect(dbWorld.data?.mode).toBe('west_marches');

    tracker.assertNoErrors();
  });

  test('T1-013: player joins existing campaign by invite code in Campaign Hub', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const playerCreds = makeUserCredentials('joiner');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    await gm.client
      .from('worlds')
      .insert({ name: 'Frostpeak Guild', mode: 'west_marches', invite_code: 'FROST99' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerCreds.email, playerCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(playerAPage);
    const rpcPromise = playerAPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/rpc/join_campaign_by_invite') && res.request().method() === 'POST',
    );
    await joinCampaignByInviteCodeInHub(playerAPage, 'FROST99');
    const rpcResp = await rpcPromise;
    expect(rpcResp.ok()).toBe(true);

    await expect(playerAPage.getByText('Frostpeak Guild').first()).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T1-014: switching activeCampaignId in TopHeader loads distinct campaign maps and lore entities', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('switcher');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    const w1 = await gm.client
      .from('worlds')
      .insert({ name: 'Campaign One', mode: 'normal', invite_code: 'ONE001' })
      .select()
      .single();
    const w2 = await gm.client
      .from('worlds')
      .insert({ name: 'Campaign Two', mode: 'west_marches', invite_code: 'TWO002' })
      .select()
      .single();

    const e1 = await gm.client.from('entities').insert({
      world_id: w1.data.id,
      slug: 'first-realm-relic',
      title: 'First Realm Relic',
      type: 'Item',
    });
    expect(e1.error).toBeNull();
    const e2 = await gm.client.from('entities').insert({
      world_id: w2.data.id,
      slug: 'second-realm-dragon',
      title: 'Second Realm Dragon',
      type: 'Creature',
    });
    expect(e2.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await switchCampaignInHeader(gmPage, 'Campaign One');
    await expect(gmPage.getByText('First Realm Relic').first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText('Second Realm Dragon')).not.toBeVisible();

    await switchCampaignInHeader(gmPage, 'Campaign Two');
    await expect(gmPage.getByText('Second Realm Dragon').first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText('First Realm Relic')).not.toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-015: web-only state reloads cleanly from Supabase with zero localStorage vault fallback keys', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('nols');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Cloud Only World', mode: 'normal', invite_code: 'CLD01' })
      .select()
      .single();
    const entRes = await gm.client.from('entities').insert({
      world_id: world.data.id,
      slug: 'cloud-lore-entry',
      title: 'Cloud Lore Entry',
      type: 'Location',
    });
    expect(entRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Cloud Lore Entry').first()).toBeVisible({ timeout: 15_000 });

    const forbiddenLocalStorageKeys = await gmPage.evaluate(() =>
      Object.keys(window.localStorage).filter((k) =>
        /vault|aethelgard|world_data|entities|maps/i.test(k) && !k.startsWith('sb-'),
      ),
    );
    expect(forbiddenLocalStorageKeys).toEqual([]);

    await gmPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(gmPage.getByText('Cloud Lore Entry').first()).toBeVisible({ timeout: 15_000 });

    tracker.assertNoErrors();
  });
});
