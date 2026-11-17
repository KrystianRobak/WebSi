import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createPngBuffer } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { getPrimaryViewportCanvas, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('T4-04: Per-Player 3D Fog of War & Peer-to-Peer Map Sharing', () => {
  test('T4-04: Distinct per-player 3D fog masks -> isolated -> Player A shares showings with Player B -> union mask -> revoke restores isolation', async ({
    gmPage,
    playerAPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    test.setTimeout(120_000);
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Misty Archipelago 3D', mode: 'west_marches', invite_code: 'FOG44' })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG44' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG44' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Shrouded Isle', kind: '3d', world_size: 200 })
      .select()
      .single();
    const mapId = mapRow.data.id as string;

    // Upload distinct fog masks for Player A and Player B to Storage
    const maskA = createPngBuffer(256, 256, [200, 200, 200, 255]);
    const maskB = createPngBuffer(256, 256, [40, 40, 40, 255]);
    await gm.client.storage.from('vault-assets').upload(`fog/${cid}/player-a.png`, maskA, {
      contentType: 'image/png',
      upsert: true,
    });
    await gm.client.storage.from('vault-assets').upload(`fog/${cid}/player-b.png`, maskB, {
      contentType: 'image/png',
      upsert: true,
    });
    const urlA = gm.client.storage.from('vault-assets').getPublicUrl(`fog/${cid}/player-a.png`).data.publicUrl;
    const urlB = gm.client.storage.from('vault-assets').getPublicUrl(`fog/${cid}/player-b.png`).data.publicUrl;

    await gm.client.from('map_fog_states').insert([
      { campaign_id: cid, map_id: mapId, user_id: playerA.userId, mask_url: urlA },
      { campaign_id: cid, map_id: mapId, user_id: playerB.userId, mask_url: urlB },
    ]);

    // Verify isolation before sharing: Player B sees only own mask
    expect((await playerB.client.from('map_fog_states').select('map_id').eq('map_id', mapId)).data).toHaveLength(1);

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

    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 30_000 });
    await expect(await getPrimaryViewportCanvas(playerAPage)).toBeVisible({ timeout: 30_000 });
    await expect(await getPrimaryViewportCanvas(playerBPage)).toBeVisible({ timeout: 30_000 });

    // Player A shares map showings with Player B (via UI toggle if present, plus protocol verification)
    const shareBtn = playerAPage.getByRole('button', { name: /share.*fog|share.*showings|share map/i }).first();
    let shareId: string | null = null;
    if (await shareBtn.isVisible().catch(() => false)) {
      await shareBtn.click();
    } else {
      const shareRes = await playerA.client
        .from('map_fog_shares')
        .insert({
          campaign_id: cid,
          map_id: mapId,
          owner_user_id: playerA.userId,
          shared_with_user_id: playerB.userId,
          share_all: false,
        })
        .select()
        .single();
      shareId = shareRes.data.id as string;
    }

    // Player B now receives both own mask + Player A's shared mask for union compositing
    await expect.poll(async () => {
      const states = await playerB.client.from('map_fog_states').select('*').eq('map_id', mapId);
      return states.data?.length ?? 0;
    }, { timeout: 10_000 }).toBe(2);

    // Revoking share restores strict per-player fog isolation
    if (shareId) {
      await playerA.client.from('map_fog_shares').delete().eq('id', shareId);
    } else {
      await playerA.client
        .from('map_fog_shares')
        .delete()
        .eq('map_id', mapId)
        .eq('owner_user_id', playerA.userId);
    }

    await expect.poll(async () => {
      const states = await playerB.client.from('map_fog_states').select('*').eq('map_id', mapId);
      return states.data?.length ?? 0;
    }, { timeout: 10_000 }).toBe(1);

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
