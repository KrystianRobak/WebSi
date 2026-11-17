import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { create256FogPngBuffer } from '../../fixtures/sampleData.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { getPrimaryViewportCanvas, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-15 Negative & Boundary: Per-Player 3D Fog of War & Map Sharing', () => {
  test('T2-071: Unshared Player A fog state remains completely hidden/shrouded for Player B', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Fog Isolation 3D', mode: 'west_marches', invite_code: 'FOG3D1' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG3D1' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG3D1' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Shrouded Continent', kind: '3d', world_size: 200 })
      .select()
      .single();

    const maskBuf = create256FogPngBuffer(255);
    await gm.client.storage.from('vault-assets').upload(`fog/${cid}/a-only.png`, maskBuf, {
      contentType: 'image/png',
      upsert: true,
    });
    const { data: pub } = gm.client.storage.from('vault-assets').getPublicUrl(`fog/${cid}/a-only.png`);

    await gm.client.from('map_fog_states').insert({
      campaign_id: cid,
      map_id: mapRow.data.id,
      user_id: playerA.userId,
      mask_url: pub.publicUrl,
    });

    // Player B cannot read Player A's fog state via REST
    const bQuery = await playerB.client
      .from('map_fog_states')
      .select('*')
      .eq('map_id', mapRow.data.id)
      .eq('user_id', playerA.userId);
    expect(bQuery.data).toEqual([]);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await expect(await getPrimaryViewportCanvas(playerBPage)).toBeVisible({ timeout: 15_000 });

    tracker.assertNoErrors();
  });

  test('T2-072: Revoking map_fog_shares re-shrouds Player B access to Player A fog mask', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Revoke 3D Fog', mode: 'west_marches', invite_code: 'FOG3D2' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG3D2' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG3D2' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Shared Coast', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gm.client.from('map_fog_states').insert({
      campaign_id: cid,
      map_id: mapRow.data.id,
      user_id: playerA.userId,
      mask_url: `${protocolRuntime.url}/storage/v1/object/public/vault-assets/fog-a.png`,
    });

    const shareRow = await playerA.client
      .from('map_fog_shares')
      .insert({
        campaign_id: cid,
        map_id: mapRow.data.id,
        owner_user_id: playerA.userId,
        shared_with_user_id: playerB.userId,
        share_all: false,
      })
      .select()
      .single();

    expect((await playerB.client.from('map_fog_states').select('*').eq('user_id', playerA.userId)).data).toHaveLength(1);

    // Revoke share
    await playerA.client.from('map_fog_shares').delete().eq('id', shareRow.data.id);
    expect((await playerB.client.from('map_fog_states').select('*').eq('user_id', playerA.userId)).data).toEqual([]);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await expect(await getPrimaryViewportCanvas(playerBPage)).toBeVisible({ timeout: 15_000 });

    tracker.assertNoErrors();
  });

  test('T2-073: Non-GM player blocked from GM 3D Fog Brush and overwriting peer/baseline fog states', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Fog Brush Guard', mode: 'west_marches', invite_code: 'FOG3D3' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG3D3' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG3D3' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Locked Fog Map', kind: '3d', world_size: 200 })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client
        .from('map_fog_states')
        .insert({
          campaign_id: cid,
          map_id: mapRow.data.id,
          user_id: playerB.userId,
          mask_url: 'http://example.invalid/forged.png',
        })
        .select(),
      'Player A forging Player B fog state',
    );
    await assertSupabaseRejected(
      playerA.client
        .from('map_fog_states')
        .insert({
          campaign_id: cid,
          map_id: mapRow.data.id,
          user_id: playerA.userId,
          mask_url: 'http://example.invalid/baseline.png',
        })
        .select(),
      'Player A writing baseline fog state',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(playerAPage.getByRole('button', { name: /fog brush|paint fog|reveal fog/i })).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-074: Out-of-bounds pointer/brush coordinates on 3D canvas clamp safely without NaN', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'UV Clamp 3D', mode: 'normal' }).select().single();
    await gm.client.from('maps').insert({ world_id: world.data.id, name: 'Clamp Terrain', kind: '3d', world_size: 200 });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    const canvas = await getPrimaryViewportCanvas(gmPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    if (box) {
      await gmPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await gmPage.mouse.down();
      await gmPage.mouse.move(-100, -100, { steps: 3 });
      await gmPage.mouse.move(box.x + box.width + 200, box.y + box.height + 200, { steps: 3 });
      await gmPage.mouse.up();
    }

    await expect(canvas).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-075: Missing/404 mask_url in map_fog_states falls back gracefully without crashing 3D viewport', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Missing Mask 404', mode: 'normal', invite_code: 'FOG404' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'FOG404' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: cid, name: 'Broken Mask Map', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gm.client.from('map_fog_states').insert({
      campaign_id: cid,
      map_id: mapRow.data.id,
      user_id: playerA.userId,
      mask_url: `${protocolRuntime.url}/storage/v1/object/public/vault-assets/does-not-exist-404.png`,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);

    const canvas = await getPrimaryViewportCanvas(playerAPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    tracker.assertNoErrors();
  });
});
