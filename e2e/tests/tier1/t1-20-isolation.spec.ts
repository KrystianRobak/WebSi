import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createPngBuffer, makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAnonClient, createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-20: Cross-Campaign & Storage Bucket RLS Isolation', () => {
  test('T1-096: user in Campaign A cannot read or query Campaign B entities, maps, or characters via UI or PostgREST', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm_iso'));
    const pACreds = makeUserCredentials('iso_a');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);

    const wA = await gm.client.from('worlds').insert({ name: 'Allowed Realm', mode: 'normal', invite_code: 'ALW01' }).select().single();
    const wB = await gm.client.from('worlds').insert({ name: 'Forbidden Realm', mode: 'normal', invite_code: 'FRB01' }).select().single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'ALW01' });

    await gm.client.from('entities').insert([
      { world_id: wA.data.id, slug: 'allowed-lore', title: 'Allowed Lore', type: 'Location' },
      { world_id: wB.data.id, slug: 'forbidden-lore', title: 'Top Secret Forbidden Lore', type: 'Location' },
    ]);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await openSidebarSection(playerAPage, 'Vault');
    await expect(playerAPage.getByText('Allowed Lore').first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Top Secret Forbidden Lore')).not.toBeVisible();

    const rlsCheck = await pA.client.from('entities').select('*').eq('world_id', wB.data.id);
    expect(rlsCheck.data).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T1-097: unauthenticated browser session renders AuthScreen and receives zero campaign rows', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm_unauth'));
    await gm.client.from('worlds').insert({ name: 'Private Citadel', mode: 'normal', invite_code: 'PRV01' });

    await playerAPage.goto(appServer.url);
    await expect(playerAPage.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Private Citadel')).not.toBeVisible();

    const anon = createAnonClient(protocolRuntime.url, protocolRuntime.anonKey);
    const anonWorlds = await anon.from('worlds').select('*');
    expect(anonWorlds.data ?? []).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T1-098: signing out clears active user state, closes workspace, and returns to AuthScreen', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm_out'));
    const pCreds = makeUserCredentials('signout');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);
    const world = await gm.client.from('worlds').insert({ name: 'Logout Keep', mode: 'normal', invite_code: 'OUT01' }).select().single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'OUT01' });
    await gm.client.from('entities').insert({ world_id: world.data.id, slug: 'logout-secret', title: 'Logout Secret', type: 'Chronicle' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openSidebarSection(playerAPage, 'Vault');
    await expect(playerAPage.getByText('Logout Secret').first()).toBeVisible({ timeout: 15_000 });

    await playerAPage.getByRole('button', { name: /sign out|log out/i }).first().click();
    await expect(playerAPage.getByRole('button', { name: /sign in|log in/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Logout Secret')).not.toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-099: vault-assets Storage bucket enforces authenticated upload and serves public read with CORS', async ({
    protocolRuntime,
  }) => {
    const anon = createAnonClient(protocolRuntime.url, protocolRuntime.anonKey);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('stor_gm'));
    const png = createPngBuffer(8, 8, [100, 150, 200, 255]);

    const anonUpload = await anon.storage
      .from('vault-assets')
      .upload('rls-check/anon.png', png, { contentType: 'image/png' });
    expect(anonUpload.error).not.toBeNull();

    const authUpload = await gm.client.storage
      .from('vault-assets')
      .upload('rls-check/gm.png', new Blob([new Uint8Array(png)], { type: 'image/png' }), {
        contentType: 'image/png',
        upsert: true,
      });
    expect(authUpload.error).toBeNull();

    const { data } = gm.client.storage.from('vault-assets').getPublicUrl('rls-check/gm.png');
    const getResp = await fetch(data.publicUrl);
    expect(getResp.status).toBe(200);
    expect(getResp.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('T1-100: player reload rehydrates shared campaign journals, characters, and timeline events cleanly from cloud', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm_rel'));
    const pCreds = makeUserCredentials('rehyd_p');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Persistent Kingdom', mode: 'normal', invite_code: 'PERS1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'PERS1' });

    await player.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: player.userId,
      name: 'Persisted Knight',
      is_active: true,
    });
    await player.client.from('journal_pages').insert({
      campaign_id: world.data.id,
      owner_id: player.userId,
      title: 'Persisted Diary',
      content: '<p>Saved safely.</p>',
      share_scope: 'private',
    });
    await gm.client.from('timeline_events').insert({
      campaign_id: world.data.id,
      title: 'Persisted Festival',
      date_label: 'Year 1100',
      sort_order: 1,
      is_gm_only: false,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await openSidebarSection(playerAPage, 'Characters');
    await expect(playerAPage.getByText('Persisted Knight').first()).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerAPage, 'Journals');
    await expect(playerAPage.getByText('Persisted Diary').first()).toBeVisible();
    await openSidebarSection(playerAPage, 'Timeline');
    await expect(playerAPage.getByText('Persisted Festival').first()).toBeVisible();

    tracker.assertNoErrors();
  });
});
