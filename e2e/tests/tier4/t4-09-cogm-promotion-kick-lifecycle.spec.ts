import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  getGmModeToggle,
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('T4-09: Co-GM Promotion, Collaboration & Member Kick Lifecycle', () => {
  test('T4-09: GM promotes Player A to co_gm -> Player A unlocks GM Mode & Sheet Studio -> GM demotes Player A and kicks Player B', async ({
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
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Council of Elders', mode: 'normal', invite_code: 'COGM49' })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'COGM49' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'COGM49' });

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

    // Step 1: GM promotes Player A to co_gm
    const promoteRes = await gm.client
      .from('campaign_members')
      .update({ role: 'co_gm' })
      .eq('campaign_id', cid)
      .eq('user_id', playerA.userId)
      .select()
      .single();
    expect(promoteRes.error).toBeNull();
    expect(promoteRes.data.role).toBe('co_gm');

    // Player A reloads -> unlocks GM Mode & Sheet Studio / GM entity authoring
    await playerAPage.reload();
    const toggleA = await getGmModeToggle(playerAPage);
    await expect(toggleA).toBeVisible({ timeout: 10_000 });
    expect(await toggleA.isDisabled()).toBe(false);

    // Co-GM Player A collaborates by creating a lore entity, but still cannot kick creator GM
    const coGmEnt = await playerA.client
      .from('entities')
      .insert({
        world_id: cid,
        slug: 'co-gm-guild-charter',
        title: 'Co-GM Guild Charter',
        type: 'Lore',
        metadata: { is_gm_only: false },
      })
      .select()
      .single();
    expect(coGmEnt.error).toBeNull();

    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .delete()
        .eq('campaign_id', cid)
        .eq('user_id', gm.userId)
        .select(),
      'co_gm attempting to kick primary GM',
    );

    // Step 2: GM demotes Player A back to player and kicks Player B
    await openProfileCampaignHub(gmPage);
    await gm.client
      .from('campaign_members')
      .update({ role: 'player' })
      .eq('campaign_id', cid)
      .eq('user_id', playerA.userId);
    await gm.client
      .from('campaign_members')
      .delete()
      .eq('campaign_id', cid)
      .eq('user_id', playerB.userId);

    // Player A loses GM powers (REST GM write rejected; UI toggle removed/disabled on reload)
    await assertSupabaseRejected(
      playerA.client
        .from('entities')
        .insert({ world_id: cid, slug: 'post-demotion-lore', title: 'Post-Demotion Lore', type: 'Lore' })
        .select(),
      'Demoted Player A inserting entity',
    );
    await playerAPage.reload();
    const toggleAfterDemote = await getGmModeToggle(playerAPage);
    if (await toggleAfterDemote.isVisible().catch(() => false)) {
      expect(await toggleAfterDemote.isDisabled()).toBe(true);
    }

    // Player B loses campaign access completely
    expect((await playerB.client.from('worlds').select('*').eq('id', cid)).data).toEqual([]);
    await playerBPage.reload();
    await openSidebarSection(playerBPage, 'Vault');
    await expect(playerBPage.getByText('Co-GM Guild Charter')).toHaveCount(0);

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
