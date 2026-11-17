import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser, assertSupabaseRejected } from '../../helpers/protocolAdmin.js';
import {
  getGmModeToggle,
  openProfileCampaignHub,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-04: Member Management & Effective GM Role Enforcement', () => {
  test('T1-016: GM copies/regenerates campaign invite link and updates invite code in database', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('invgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Invite Link Keep', mode: 'west_marches', invite_code: 'OLD123' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    await expect(gmPage.getByText(/OLD123/).first()).toBeVisible();

    const regenBtn = gmPage.getByRole('button', { name: /regenerate|new invite|rotate/i }).first();
    await regenBtn.click();

    await expect
      .poll(async () => {
        const res = await gm.client.from('worlds').select('invite_code').eq('id', world.data.id).single();
        return res.data?.invite_code;
      })
      .not.toBe('OLD123');

    tracker.assertNoErrors();
  });

  test('T1-017: GM promotes player to co_gm and demotes back to player', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('promogm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const playerCreds = makeUserCredentials('promoplayer');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Co-GM Academy', mode: 'normal', invite_code: 'COGM1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'COGM1' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    await expect(gmPage.getByText(new RegExp(playerCreds.displayName, 'i')).first()).toBeVisible();

    const roleSelect = gmPage.getByRole('combobox', {
      name: new RegExp(`Role for ${playerCreds.displayName}`, 'i'),
    });

    await roleSelect.selectOption('co_gm');

    await expect
      .poll(async () => {
        const res = await gm.client
          .from('campaign_members')
          .select('role')
          .eq('campaign_id', world.data.id)
          .eq('user_id', player.userId)
          .single();
        return res.data?.role;
      })
      .toBe('co_gm');

    await roleSelect.selectOption('player');

    await expect
      .poll(async () => {
        const res = await gm.client
          .from('campaign_members')
          .select('role')
          .eq('campaign_id', world.data.id)
          .eq('user_id', player.userId)
          .single();
        return res.data?.role;
      })
      .toBe('player');

    tracker.assertNoErrors();
  });

  test('T1-018: GM kicks a player from the campaign and revokes their RLS access', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('kickgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const playerCreds = makeUserCredentials('kicktarget');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Kick Citadel', mode: 'normal', invite_code: 'KICK1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'KICK1' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    const kickBtn = gmPage.getByRole('button', {
      name: new RegExp(`Kick ${playerCreds.displayName}`, 'i'),
    });
    await kickBtn.click();

    await expect
      .poll(async () => {
        const res = await gm.client
          .from('campaign_members')
          .select('user_id')
          .eq('campaign_id', world.data.id)
          .eq('user_id', player.userId);
        return res.data?.length ?? 0;
      })
      .toBe(0);

    // Kicked player can no longer read campaign worlds
    const afterKickWorlds = await player.client.from('worlds').select('id').eq('id', world.data.id);
    expect(afterKickWorlds.data).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T1-019: TopHeader exposes GM Mode toggle for gm/co_gm and omits it for players', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const playerTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('togglegm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const playerCreds = makeUserCredentials('toggleplayer');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Role Gate Hall', mode: 'normal', invite_code: 'GATE1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'GATE1' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    const gmToggle = await getGmModeToggle(gmPage);
    await expect(gmToggle).toBeVisible();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerCreds.email, playerCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    const playerToggle = await getGmModeToggle(playerAPage);
    await expect(playerToggle).not.toBeVisible();

    // RLS also blocks player from writing GM-only entities
    await assertSupabaseRejected(
      player.client.from('entities').insert({ world_id: world.data.id, slug: 'illegal', title: 'Illegal', type: 'NPC' }).select(),
      'player entity insert blocked by RLS',
    );

    gmTracker.assertNoErrors();
    playerTracker.assertNoErrors();
  });

  test('T1-020: GM toggling gmMode=false hides is_gm_only entities and gm_secrets from the workspace', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('gmview');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Secret Vault', mode: 'normal', invite_code: 'SEC01' })
      .select()
      .single();

    const entRes = await gm.client.from('entities').insert([
      {
        world_id: world.data.id,
        slug: 'public-tavern',
        title: 'Public Tavern',
        type: 'Location',
        content: '<p>Warm hearth.</p>',
        metadata: { is_gm_only: false },
        gm_secrets: 'Trapdoor under the bar',
      },
      {
        world_id: world.data.id,
        slug: 'hidden-lich-lair',
        title: 'Hidden Lich Lair',
        type: 'Location',
        content: '<p>Top secret.</p>',
        metadata: { is_gm_only: true },
        gm_secrets: 'Phylactery inside chest',
      },
    ]);
    expect(entRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openSidebarSection(gmPage, 'Vault');
    await expect(gmPage.getByText('Hidden Lich Lair').first()).toBeVisible({ timeout: 15_000 });

    await gmPage.getByText('Public Tavern').first().click();
    await expect(gmPage.getByText(/Trapdoor under the bar/i).first()).toBeVisible();

    const gmToggle = await getGmModeToggle(gmPage);
    await gmToggle.click();

    await expect(gmPage.getByText('Hidden Lich Lair')).not.toBeVisible();
    await expect(gmPage.getByText(/Trapdoor under the bar/i)).not.toBeVisible();

    tracker.assertNoErrors();
  });
});
