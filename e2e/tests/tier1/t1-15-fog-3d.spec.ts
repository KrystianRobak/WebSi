import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { create256FogPngBuffer, makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { getPrimaryViewportCanvas, getRightInspectorToggle, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-15: Per-Player 3D Fog of War, GM Fog Brush & Player Map Sharing', () => {
  test('T1-071: 3D Map initializes with shrouded fog baseline and renders WebGL2 canvas cleanly', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('fog3d_p');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Shrouded Isles', mode: 'west_marches', invite_code: 'SHRD1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'SHRD1' });
    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Fogged Overworld',
      kind: '3d',
      world_size: 200,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await expect(playerAPage.getByText('Fogged Overworld').first()).toBeVisible({ timeout: 15_000 });
    await playerAPage.getByText('Fogged Overworld').first().click();

    const canvas = await getPrimaryViewportCanvas(playerAPage);
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBe(true);

    tracker.assertNoErrors();
  });

  test('T1-072: GM activates 3D Fog Brush to paint reveal and uploads PNG mask to vault-assets Storage', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('fog3d_gm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Brush Archipelago', mode: 'west_marches', invite_code: 'BRSH1' })
      .select()
      .single();
    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Overworld 3D', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Overworld 3D').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Overworld 3D').first().click();

    const fogBrushBtn = gmPage.getByRole('button', { name: /fog brush|3d fog|fog of war/i }).first();
    await fogBrushBtn.click();

    const uploadPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

    const uploadResp = await uploadPromise;
    expect(uploadResp.ok()).toBe(true);

    await expect
      .poll(async () => (await gm.client.from('map_fog_states').select('map_id').eq('map_id', mapRow.data.id)).data?.length ?? 0)
      .toBeGreaterThan(0);

    tracker.assertNoErrors();
  });

  test('T1-073: GM painting fog reveal for target Player A persists and excludes Player B', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('fogtgt_gm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const pACreds = makeUserCredentials('fogtgt_a');
    const pBCreds = makeUserCredentials('fogtgt_b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Target Fog Isles', mode: 'west_marches', invite_code: 'TFOG1' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'TFOG1' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'TFOG1' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Target 3D Map', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Target 3D Map').first().click();

    await gmPage.getByRole('button', { name: /fog brush|3d fog|fog of war/i }).first().click();
    const targetSelect = gmPage.getByLabel(/target player|fog target|player/i).first();
    await targetSelect.selectOption(pA.userId);

    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

    await expect
      .poll(async () => (await pA.client.from('map_fog_states').select('map_id').eq('map_id', mapRow.data.id).eq('user_id', pA.userId)).data?.length ?? 0)
      .toBeGreaterThan(0);

    // Player B cannot see Player A's unshared fog state
    const bFog = await pB.client.from('map_fog_states').select('map_id').eq('map_id', mapRow.data.id).eq('user_id', pA.userId);
    expect(bFog.data).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T1-074: GM switches 3D Fog Brush to Hide mode to re-shroud a revealed area', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('foghide_gm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Hide Fog Isles', mode: 'normal', invite_code: 'HFOG1' })
      .select()
      .single();
    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Hide 3D Map', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Hide 3D Map').first().click();

    await gmPage.getByRole('button', { name: /fog brush|3d fog|fog of war/i }).first().click();
    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

    const hideBtn = gmPage.getByRole('button', { name: /^hide$|shroud/i }).first();
    await hideBtn.click();

    const secondUpload = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    expect((await secondUpload).ok()).toBe(true);

    const states = await gm.client.from('map_fog_states').select('mask_url').eq('map_id', mapRow.data.id);
    expect((states.data ?? []).length).toBeGreaterThan(0);

    tracker.assertNoErrors();
  });

  test('T1-075: player toggles "Share My Map Showings" with peer so peer accesses union of shared fog masks', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pACreds = makeUserCredentials('sharefog_a');
    const pBCreds = makeUserCredentials('sharefog_b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Union Fog Isles', mode: 'west_marches', invite_code: 'UFOG1' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'UFOG1' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'UFOG1' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Shared 3D Map', kind: '3d', world_size: 200 })
      .select()
      .single();

    const maskBuf = create256FogPngBuffer(200);
    await gm.client.storage
      .from('vault-assets')
      .upload(`fog/${world.data.id}/a.png`, new Blob([new Uint8Array(maskBuf)], { type: 'image/png' }), {
        contentType: 'image/png',
        upsert: true,
      });
    const { data: pubUrl } = gm.client.storage.from('vault-assets').getPublicUrl(`fog/${world.data.id}/a.png`);
    const fogInsert = await gm.client.from('map_fog_states').insert({
      campaign_id: world.data.id,
      map_id: mapRow.data.id,
      user_id: pA.userId,
      mask_url: pubUrl.publicUrl,
    });
    expect(fogInsert.error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await playerAPage.getByText('Shared 3D Map').first().click();

    const sharingHeader = playerAPage.getByText(/Share My Map Showings/i).first();
    if (!(await sharingHeader.isVisible().catch(() => false))) {
      await (await getRightInspectorToggle(playerAPage)).click();
    }
    await expect(sharingHeader).toBeVisible({ timeout: 15_000 });
    const shareTarget = playerAPage.getByLabel(new RegExp(pBCreds.displayName, 'i')).or(
      playerAPage.getByRole('checkbox', { name: new RegExp(pBCreds.displayName, 'i') }),
    ).first();
    await shareTarget.click();

    await expect
      .poll(async () => (await pB.client.from('map_fog_states').select('user_id').eq('map_id', mapRow.data.id).eq('user_id', pA.userId)).data?.length ?? 0)
      .toBe(1);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await playerBPage.getByText('Shared 3D Map').first().click();
    await expect(await getPrimaryViewportCanvas(playerBPage)).toBeVisible({ timeout: 15_000 });

    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
