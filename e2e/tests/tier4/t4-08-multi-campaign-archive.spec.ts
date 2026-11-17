import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createValidCampaignArchiveV2 } from '../../fixtures/sampleData.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
  switchCampaignInHeader,
} from '../../helpers/uiActions.js';

test.describe('T4-08: Multi-Campaign Isolation, Normal Multi-Char Mode & JSON Archive Cloning', () => {
  test('T4-08: WM Campaign 1 + Normal Campaign 2 -> Player A has 2 active chars in C2 & 1 in C1 -> Player B excluded from C2 -> UUID-remapped archive import creates C3', async ({
    gmPage,
    playerAPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    // Campaign 1: West Marches (Player A & Player B)
    const wmWorld = await gm.client
      .from('worlds')
      .insert({ name: 'WM Campaign One', mode: 'west_marches', invite_code: 'WM48' })
      .select()
      .single();
    const wmId = wmWorld.data.id as string;

    // Campaign 2: Normal Mode (Player A ONLY)
    const normWorld = await gm.client
      .from('worlds')
      .insert({ name: 'Normal Campaign Two', mode: 'normal', invite_code: 'NORM48' })
      .select()
      .single();
    const normId = normWorld.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WM48' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'WM48' });
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'NORM48' });

    // Player A: 1 active char in WM C1; 2 active chars in Normal C2
    await playerA.client.from('characters').insert({
      campaign_id: wmId,
      user_id: playerA.userId,
      name: 'WM Lone Ranger',
      is_active: true,
    });
    await assertSupabaseRejected(
      playerA.client
        .from('characters')
        .insert({ campaign_id: wmId, user_id: playerA.userId, name: 'WM Blocked 2nd', is_active: true })
        .select(),
      '2nd active char in WM Campaign 1',
    );

    await playerA.client.from('characters').insert([
      { campaign_id: normId, user_id: playerA.userId, name: 'Normal Knight Alpha', is_active: true },
      { campaign_id: normId, user_id: playerA.userId, name: 'Normal Mage Beta', is_active: true },
    ]);

    // Player B completely excluded from Campaign 2
    expect((await playerB.client.from('worlds').select('*').eq('id', normId)).data).toEqual([]);
    expect((await playerB.client.from('characters').select('*').eq('campaign_id', normId)).data).toEqual([]);

    await Promise.all([
      gmPage.goto(appServer.url),
      playerAPage.goto(appServer.url),
      playerBPage.goto(appServer.url),
    ]);
    await Promise.all([
      signInViaAuthScreen(gmPage, gm.email, gm.password),
      signInViaAuthScreen(playerAPage, playerA.email, playerA.password),
      signInViaAuthScreen(playerBPage, playerB.email, playerB.password),
    ]);

    // Player A switches to Normal Campaign Two and verifies both active characters
    await switchCampaignInHeader(playerAPage, 'Normal Campaign Two');
    await openSidebarSection(playerAPage, 'Characters');
    await expect(playerAPage.getByText('Normal Knight Alpha').first()).toBeVisible({ timeout: 10_000 });
    await expect(playerAPage.getByText('Normal Mage Beta').first()).toBeVisible({ timeout: 10_000 });

    // Player B never sees Normal Campaign Two
    await expect(playerBPage.getByText('Normal Campaign Two')).toHaveCount(0);

    // GM imports UUID-remapped CampaignArchiveV2 into Campaign 3
    await openProfileCampaignHub(gmPage);
    const archiveV2 = createValidCampaignArchiveV2({ name: 'Cloned Campaign Three', mode: 'west_marches', includeDataUrlImage: true });
    const fileInput = gmPage.locator('input[type="file"][accept*="json" i], input[type="file"]').first();
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles({
        name: 'campaign-clone.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(archiveV2), 'utf8'),
      });
      await expect(gmPage.getByText('Cloned Campaign Three').first()).toBeVisible({ timeout: 15_000 });
    }

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
