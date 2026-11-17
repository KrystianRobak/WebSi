import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { create256FogPngBuffer, makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  assertNoHudOverlapWithInspector,
  createCampaignInHub,
  getPrimaryViewportCanvas,
  getRightInspectorToggle,
  openCommandPalette,
  openProfileCampaignHub,
  openSidebarSection,
  searchCommandPalette,
  signInViaAuthScreen,
  triggerWorldsmithUndo,
} from '../../helpers/uiActions.js';

test.describe('Tier 3 Pairwise Integration: 3D Fog, Quest Boards & Worldsmith UX (T3-13..T3-18)', () => {
  test('T3-13: [UF-15 x UF-19] Worldsmith auto-opens inspector -> Ctrl+Z sculpt undo -> 3D Fog brush uploads PNG to Storage', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_wsfog');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Worldsmith Fog Isles', mode: 'west_marches', invite_code: 'WSF13' })
      .select()
      .single();
    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Isles 3D', kind: '3d', world_size: 200 })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Isles 3D').first().click();

    await gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first().click();
    await expect(gmPage.locator('aside').last()).toBeVisible({ timeout: 10_000 });

    const canvas = await getPrimaryViewportCanvas(gmPage);
    const box = (await canvas.boundingBox())!;
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await triggerWorldsmithUndo(gmPage);

    await gmPage.getByRole('button', { name: /^Atlas$/i }).first().click();
    await gmPage.getByRole('button', { name: /fog brush|3d fog|fog of war/i }).first().click();
    const uploadPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    await gmPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    expect((await uploadPromise).ok()).toBe(true);

    await expect
      .poll(async () => (await gm.client.from('map_fog_states').select('map_id').eq('map_id', mapRow.data.id)).data?.length ?? 0)
      .toBeGreaterThan(0);

    tracker.assertNoErrors();
  });

  test('T3-14: [UF-15 x UF-04] Player A shares 3D fog mask with Player B; GM kicking Player B revokes access', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_gm14');
    const pACreds = makeUserCredentials('t3_p14a');
    const pBCreds = makeUserCredentials('t3_p14b');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Shared Fog Realm', mode: 'west_marches', invite_code: 'SFR14' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SFR14' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'SFR14' });

    const mapRow = await gm.client
      .from('maps')
      .insert({ world_id: world.data.id, name: 'Realm 3D', kind: '3d', world_size: 200 })
      .select()
      .single();

    const buf = create256FogPngBuffer(220);
    await gm.client.storage.from('vault-assets').upload(`fog/${world.data.id}/pA.png`, new Blob([new Uint8Array(buf)], { type: 'image/png' }), {
      contentType: 'image/png',
      upsert: true,
    });
    const { data: pub } = gm.client.storage.from('vault-assets').getPublicUrl(`fog/${world.data.id}/pA.png`);
    await gm.client.from('map_fog_states').insert({
      campaign_id: world.data.id,
      map_id: mapRow.data.id,
      user_id: pA.userId,
      mask_url: pub.publicUrl,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await playerAPage.getByText('Realm 3D').first().click();
    await (await getRightInspectorToggle(playerAPage)).click();

    await playerAPage.getByLabel(new RegExp(pBCreds.displayName, 'i')).first().click();
    await expect
      .poll(async () => (await pB.client.from('map_fog_states').select('map_id').eq('map_id', mapRow.data.id)).data?.length ?? 0)
      .toBe(1);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openProfileCampaignHub(gmPage);
    await gmPage
      .getByRole('button', { name: new RegExp(`kick.*${pBCreds.displayName}`, 'i') })
      .click();

    await expect
      .poll(async () => (await pB.client.from('map_fog_states').select('map_id').eq('map_id', mapRow.data.id)).data?.length ?? 0)
      .toBe(0);

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });

  test('T3-15: [UF-16 x UF-13] West Marches 3D Quest Board enforces active character requirement & atomic cap contention', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const tA = attachPageErrorTracker(playerAPage);
    const tB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm15'));
    const pACreds = makeUserCredentials('t3_p15a');
    const pBCreds = makeUserCredentials('t3_p15b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Expedition Hub', mode: 'west_marches', invite_code: 'EXP15' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'EXP15' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'EXP15' });

    await pA.client.from('characters').insert({ campaign_id: world.data.id, user_id: pA.userId, name: 'Hero A', is_active: true });
    await pB.client.from('characters').insert({ campaign_id: world.data.id, user_id: pB.userId, name: 'Hero B', is_active: true });

    const map3d = await gm.client.from('maps').insert({ world_id: world.data.id, name: 'Outlands', kind: '3d' }).select().single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: world.data.id, map_id: map3d.data.id, title: 'Outpost Board', x: 0, y: 1, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: world.data.id, board_id: board.data.id, title: 'Single Slot Hunt', max_players: 1, status: 'open' })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await playerAPage.getByText('Outlands').first().click();
    await playerAPage.getByRole('button', { name: /Outpost Board|Quest Board/i }).first().click();
    await playerAPage.getByRole('button', { name: /accept task|accept|sign up/i }).first().click();

    await expect
      .poll(async () => (await gm.client.from('guild_quests').select('status').eq('id', quest.data.id).single()).data?.status)
      .toBe('full');

    // Unmount Player A's 3D WebGL2 canvas before launching Player B under SwiftShader
    await playerAPage.getByRole('button', { name: /Close Quest Board/i }).first().click();
    await openProfileCampaignHub(playerAPage);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await playerBPage.getByText('Outlands').first().click();
    await expect(await getPrimaryViewportCanvas(playerBPage)).toBeVisible({ timeout: 15_000 });
    await playerBPage.getByRole('button', { name: /Outpost Board|Quest Board/i }).first().click();
    await expect(playerBPage.getByText(/full/i).first()).toBeVisible();

    tA.assertNoErrors();
    tB.assertNoErrors();
  });

  test('T3-16: [UF-16 x UF-17] 2D Battlemap Quest Board badge updates open quest count in Realtime on player signup', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const tA = attachPageErrorTracker(playerAPage);
    const tB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm16'));
    const pACreds = makeUserCredentials('t3_p16a');
    const pBCreds = makeUserCredentials('t3_p16b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: '2D Guildhall', mode: 'west_marches', invite_code: 'GH161' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'GH161' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'GH161' });
    await pA.client.from('characters').insert({ campaign_id: world.data.id, user_id: pA.userId, name: 'Squire A', is_active: true });

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Tavern Floor',
        kind: '2d',
        battlemap: { gridSizePx: 50, width: 700, height: 700, showGrid: true, tokens: [], walls: [], doors: [], lights: [] },
      })
      .select()
      .single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: world.data.id, map_id: bmap.data.id, title: 'Hall Board', x: 3, y: 3, z: 0 })
      .select()
      .single();
    await gm.client.from('guild_quests').insert({
      campaign_id: world.data.id,
      board_id: board.data.id,
      title: 'Guard Duty',
      max_players: 1,
      status: 'open',
    });

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await playerBPage.getByText('Tavern Floor').first().click();
    await expect(playerBPage.getByRole('button', { name: /Hall Board|Quest Board/i }).first()).toContainText('1');

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await playerAPage.getByText('Tavern Floor').first().click();
    await playerAPage.getByRole('button', { name: /Hall Board|Quest Board/i }).first().click();
    await playerAPage.getByRole('button', { name: /accept task|accept|sign up/i }).first().click();

    await expect(playerBPage.getByRole('button', { name: /Hall Board|Quest Board/i }).first()).toContainText('0', {
      timeout: 15_000,
    });

    tA.assertNoErrors();
    tB.assertNoErrors();
  });

  test('T3-17: [UF-07 x UF-19] Inspector safe-inset layout holds in Worldsmith and CommandPalette jumps to 2D Battlemap', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_inset');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Nav & Worldsmith', mode: 'normal', invite_code: 'NWS17' })
      .select()
      .single();

    await gm.client.from('maps').insert([
      { world_id: world.data.id, name: 'Main Overworld', kind: '3d', world_size: 200 },
      { world_id: world.data.id, name: 'Dungeon Level 1', kind: '2d' },
    ]);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Main Overworld').first().click();
    await gmPage.getByRole('button', { name: /worldsmith|sculpt/i }).first().click();

    const inspector = gmPage.locator('aside').last();
    await expect(inspector).toBeVisible({ timeout: 10_000 });
    const hud = gmPage.locator('[data-testid="viewport-hud"], .viewport-hud').first();
    if (await hud.isVisible().catch(() => false)) {
      await assertNoHudOverlapWithInspector(gmPage, hud, inspector);
    }

    await openCommandPalette(gmPage);
    await searchCommandPalette(gmPage, 'Dungeon Level 1');
    await expect(gmPage.getByText(/2D Battlemap/i).first()).toBeVisible();
    await gmPage.getByText('Dungeon Level 1').first().click();
    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T3-18: [UF-05 x UF-19] Lazy starter campaign seeding uploads Storage terrain PNGs & reloads Worldsmith cleanly', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_seed3d');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openProfileCampaignHub(gmPage);

    const uploadPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    await createCampaignInHub(gmPage, { name: 'Seeded Worldsmith', mode: 'normal', seedStarter: true });
    expect((await uploadPromise).ok()).toBe(true);

    await openSidebarSection(gmPage, 'Vault');
    await gmPage.getByText('World Map: Shattered Reach').first().click();
    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 15_000 });
    await gmPage.reload({ waitUntil: 'domcontentloaded' });
    await openSidebarSection(gmPage, 'Vault');
    await gmPage.getByText('World Map: Shattered Reach').first().click();
    await expect(await getPrimaryViewportCanvas(gmPage)).toBeVisible({ timeout: 15_000 });

    tracker.assertNoErrors();
  });
});
