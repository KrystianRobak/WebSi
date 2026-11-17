import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createAuthenticatedUser, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  createCampaignInHub,
  joinCampaignByInviteCodeInHub,
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
  switchCampaignInHeader,
} from '../../helpers/uiActions.js';

test.describe('UF-03 Negative & Boundary: Campaigns, Invite Join & Multi-Campaign Switching', () => {
  test('T2-011: Empty or whitespace-only campaign name creation is blocked', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openProfileCampaignHub(gmPage);

    await createCampaignInHub(gmPage, { name: '   ', mode: 'normal' });

    // No world row should have been created
    const worldsRes = await gm.client.from('worlds').select('*');
    expect(worldsRes.error).toBeNull();
    expect(worldsRes.data).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T2-012: Bad invite code shows error and creates no membership', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Real Campaign', mode: 'west_marches', invite_code: 'REAL01' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openProfileCampaignHub(playerAPage);

    await joinCampaignByInviteCodeInHub(playerAPage, 'NOPE9999');

    await expect(playerAPage.getByText(/invalid|not found|error|failed/i).first()).toBeVisible({ timeout: 10_000 });
    const memberships = await playerA.client.from('campaign_members').select('*');
    expect(memberships.data).toEqual([]);

    tracker.assertNoErrors({
      allowConsoleErrorPatterns: [/Failed to load resource:.*(404|400)/i],
    });
  });

  test('T2-013: Duplicate invite join is idempotent without duplicate member rows', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const worldRes = await gm.client
      .from('worlds')
      .insert({ name: 'Idempotent Reach', mode: 'west_marches', invite_code: 'IDEM01' })
      .select()
      .single();
    expect(worldRes.error).toBeNull();
    const cid = worldRes.data.id as string;

    // Join once via RPC, then again via Hub UI
    const rpc1 = await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'IDEM01' });
    expect(rpc1.error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openProfileCampaignHub(playerAPage);
    await joinCampaignByInviteCodeInHub(playerAPage, 'IDEM01');

    const rpc2 = await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'IDEM01' });
    expect(rpc2.error).toBeNull();
    expect(rpc2.data).toBe(cid);

    const members = await playerA.client
      .from('campaign_members')
      .select('*')
      .eq('campaign_id', cid)
      .eq('user_id', playerA.userId);
    expect(members.data).toHaveLength(1);

    tracker.assertNoErrors();
  });

  test('T2-014: Unjoined user querying worlds returns 0 rows and sees nothing in Hub', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerBPage);
    const { gm, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client
      .from('worlds')
      .insert({ name: 'Private Citadel', mode: 'normal', invite_code: 'SECRET1' })
      .select()
      .single();

    const queryRes = await playerB.client.from('worlds').select('*');
    expect(queryRes.error).toBeNull();
    expect(queryRes.data).toEqual([]);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await expect(playerBPage.getByText('Private Citadel')).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-015: Rapid campaign switch prevents stale entity or pin bleed across campaigns', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    const w1 = await gm.client.from('worlds').insert({ name: 'Alpha Realm', mode: 'normal' }).select().single();
    const w2 = await gm.client.from('worlds').insert({ name: 'Beta Realm', mode: 'normal' }).select().single();
    const cid1 = w1.data.id as string;
    const cid2 = w2.data.id as string;

    await gm.client.from('entities').insert({ world_id: cid1, slug: 'alpha-relic', title: 'AlphaOnlyRelic', type: 'Item' });
    await gm.client.from('entities').insert({ world_id: cid2, slug: 'beta-relic', title: 'BetaOnlyRelic', type: 'Item' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    // Rapid switch between Alpha Realm and Beta Realm
    await switchCampaignInHeader(gmPage, 'Alpha Realm');
    await switchCampaignInHeader(gmPage, 'Beta Realm');
    await openSidebarSection(gmPage, 'Vault');

    await expect(gmPage.getByText('BetaOnlyRelic').first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText('AlphaOnlyRelic')).toHaveCount(0);

    tracker.assertNoErrors();
  });
});
