import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  getGmModeToggle,
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-04 Negative & Boundary: Member Management & Effective GM Enforcement', () => {
  test('T2-016: Non-GM player cannot elevate gmMode in UI or self-promote via REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Strict Hierarchy', mode: 'normal', invite_code: 'HIER01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'HIER01' });

    // REST self-promotion blocked
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .update({ role: 'gm' })
        .eq('campaign_id', cid)
        .eq('user_id', playerA.userId)
        .select(),
      'Player self-promotion to GM',
    );

    // UI must not expose an active GM mode switch to a player
    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);

    const gmToggle = await getGmModeToggle(playerAPage);
    const visible = await gmToggle.isVisible().catch(() => false);
    if (visible) {
      expect(await gmToggle.isDisabled()).toBe(true);
    }

    tracker.assertNoErrors();
  });

  test('T2-017: Player blocked from regenerating invite code, changing roles, or kicking members', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Locked Roster', mode: 'west_marches', invite_code: 'LOCK01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'LOCK01' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'LOCK01' });

    // REST blocks for invite regen, role change, kick
    await assertSupabaseRejected(
      playerA.client.from('worlds').update({ invite_code: 'HACKED1' }).eq('id', cid).select(),
      'Player regenerate invite code',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .update({ role: 'co_gm' })
        .eq('campaign_id', cid)
        .eq('user_id', playerB.userId)
        .select(),
      'Player promote Player B',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .delete()
        .eq('campaign_id', cid)
        .eq('user_id', playerB.userId)
        .select(),
      'Player kick Player B',
    );

    // UI hides kick/regenerate controls from Player A
    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openProfileCampaignHub(playerAPage);

    await expect(playerAPage.getByRole('button', { name: /regenerate invite|kick/i })).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-018: gm_secrets and is_gm_only entities hidden from player in UI and REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Hidden Secrets', mode: 'normal', invite_code: 'SECR01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SECR01' });

    await gm.client.from('entities').insert([
      {
        world_id: cid,
        slug: 'public-tavernkeeper',
        title: 'Public Tavernkeeper',
        type: 'NPC',
        summary: 'Serves ale',
        metadata: { is_gm_only: false },
        gm_secrets: 'TOP_SECRET_ASSASSIN_PLOT',
      },
      {
        world_id: cid,
        slug: 'hidden-lich-phylactery',
        title: 'Hidden Lich Phylactery',
        type: 'Location',
        summary: 'GM Eyes Only',
        metadata: { is_gm_only: true },
        gm_secrets: 'INSIDE_THE_CROWN',
      },
    ]);

    // REST check: gm_secrets nullified for non-GM member
    const restEntities = await playerA.client.from('entities').select('*').eq('world_id', cid);
    expect(restEntities.error).toBeNull();
    expect(restEntities.data?.length).toBeGreaterThanOrEqual(1);
    for (const row of restEntities.data ?? []) {
      expect(row.gm_secrets).toBeNull();
    }

    // UI check
    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Vault');

    await expect(playerAPage.getByText('Public Tavernkeeper').first()).toBeVisible({ timeout: 10_000 });
    await expect(playerAPage.getByText('Hidden Lich Phylactery')).toHaveCount(0);
    await expect(playerAPage.getByText('TOP_SECRET_ASSASSIN_PLOT')).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-019: Kicked player immediately loses campaign access in UI and REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Exile Reach', mode: 'normal', invite_code: 'EXIL01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'EXIL01' });
    await gm.client.from('entities').insert({ world_id: cid, slug: 'keep-lore', title: 'Keep Lore', type: 'Lore' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(playerAPage.getByText('Exile Reach').first()).toBeVisible({ timeout: 10_000 });

    // GM kicks Player A
    const kickRes = await gm.client
      .from('campaign_members')
      .delete()
      .eq('campaign_id', cid)
      .eq('user_id', playerA.userId);
    expect(kickRes.error).toBeNull();

    // REST reads return empty
    const worldsAfter = await playerA.client.from('worlds').select('*').eq('id', cid);
    expect(worldsAfter.data).toEqual([]);
    const entitiesAfter = await playerA.client.from('entities').select('*').eq('world_id', cid);
    expect(entitiesAfter.data).toEqual([]);

    // Reload UI verifies Exile Reach is gone
    await playerAPage.reload();
    await expect(playerAPage.getByText('Keep Lore')).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-020: co_gm cannot kick/demote primary GM and gmMode=false hides GM controls', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Co-GM Safeguard', mode: 'normal', invite_code: 'COGM01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'COGM01' });
    await gm.client
      .from('campaign_members')
      .update({ role: 'co_gm' })
      .eq('campaign_id', cid)
      .eq('user_id', playerA.userId);

    // Co-GM blocked from demoting or kicking creator GM
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .update({ role: 'player' })
        .eq('campaign_id', cid)
        .eq('user_id', gm.userId)
        .select(),
      'co_gm demoting primary GM',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('campaign_members')
        .delete()
        .eq('campaign_id', cid)
        .eq('user_id', gm.userId)
        .select(),
      'co_gm kicking primary GM',
    );

    // GM turns gmMode=false -> GM-only entities & GM controls hide in UI
    await gm.client.from('entities').insert({
      world_id: cid,
      slug: 'secret-gm-blueprint',
      title: 'Secret GM Blueprint',
      type: 'Lore',
      metadata: { is_gm_only: true },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    const gmToggle = await getGmModeToggle(gmPage);
    await expect(gmToggle).toBeVisible({ timeout: 10_000 });
    await gmToggle.click();

    await openSidebarSection(gmPage, 'Vault');
    await expect(gmPage.getByText('Secret GM Blueprint')).toHaveCount(0);

    tracker.assertNoErrors();
  });
});
