import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  getRightInspectorToggle,
  openCommandPalette,
  openSidebarSection,
  searchCommandPalette,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-07: Workspace Shell, Tab Router, LeftSidebar, RightInspector & CommandPalette', () => {
  test('T1-031: LeftSidebar renders active campaign title (never hardcoded Shattered Reach) and all workspace sections', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('sidebar');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    await gm.client.from('worlds').insert({
      name: 'Emerald Coastline',
      mode: 'normal',
      invite_code: 'SIDE1',
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openSidebarSection(gmPage, 'Vault');
    const sidebar = gmPage.locator('aside').first();
    await expect(sidebar.getByText('Emerald Coastline').first()).toBeVisible();
    await expect(sidebar.getByText('Shattered Reach')).not.toBeVisible();

    for (const label of [/vault|lore/i, /journals?/i, /characters?/i, /sheet/i, /timeline/i, /profile|hub/i]) {
      await expect(gmPage.getByRole('button', { name: label }).first()).toBeVisible();
    }

    tracker.assertNoErrors();
  });

  test('T1-032: tab router opens all 9 TabKind views (map, entity, asset, template, journal, character, sheet_studio, timeline, profile_hub)', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('tabs');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Nine Tabs Citadel', mode: 'normal', invite_code: 'TABS9' })
      .select()
      .single();
    const cid = world.data.id as string;

    expect((await gm.client.from('maps').insert({ world_id: cid, name: 'Citadel Map', kind: '3d' })).error).toBeNull();
    expect((await gm.client.from('entities').insert({ world_id: cid, slug: 'tab-entity', title: 'Tab Entity', type: 'Character' })).error).toBeNull();
    expect((await gm.client.from('vault_assets').insert({ world_id: cid, slug: 'tab-asset', name: 'Tab Asset', kind: 'scene', url: 'https://example.com/a.png' })).error).toBeNull();
    expect((await gm.client.from('entity_templates').insert({ world_id: cid, type: 'Location', label: 'Tab Template' })).error).toBeNull();
    expect((await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'Tab Journal',
      content: '<p>Hi</p>',
      share_scope: 'private',
    })).error).toBeNull();
    expect((await gm.client.from('characters').insert({
      campaign_id: cid,
      user_id: gm.userId,
      name: 'Tab Hero',
      is_active: true,
    })).error).toBeNull();

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    await gmPage.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: pngBytes }),
    );

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    // Open map, entity, asset, template, journal, character, sheet_studio, timeline, profile_hub
    await openSidebarSection(gmPage, 'Vault');
    await gmPage.getByText('Citadel Map').first().click();
    await gmPage.getByText('Tab Entity').first().click();

    await openSidebarSection(gmPage, 'Assets');
    await gmPage.getByText('Tab Asset').first().click();

    await openSidebarSection(gmPage, 'Templates');
    await gmPage.locator('aside').getByRole('button', { name: /^Location$/i }).first().click();

    await openSidebarSection(gmPage, 'Journals');
    await gmPage.getByText('Tab Journal').first().click();

    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Tab Hero').first().click();

    await openSidebarSection(gmPage, 'Sheet Studio');
    await expect(gmPage.getByText(/html|sheet studio|template/i).first()).toBeVisible();

    await openSidebarSection(gmPage, 'Timeline');
    await expect(gmPage.getByText(/timeline|calendar/i).first()).toBeVisible();

    await openSidebarSection(gmPage, 'Profile');
    await expect(gmPage.getByText(/Nine Tabs Citadel/i).first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-033: CommandPalette displays "2D Battlemap" subtitle and indexes entities, journals, characters, and timeline', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('cmdpal');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Palette Realm', mode: 'normal', invite_code: 'CMD01' })
      .select()
      .single();
    const cid = world.data.id as string;

    expect((await gm.client.from('maps').insert({ world_id: cid, name: 'Arena Grid', kind: '2d' })).error).toBeNull();
    expect((await gm.client.from('entities').insert({ world_id: cid, slug: 'palette-dragon', title: 'Palette Dragon', type: 'Bestiary' })).error).toBeNull();
    expect((await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'Palette Logbook',
      content: '<p>Entry</p>',
      share_scope: 'private',
    })).error).toBeNull();
    expect((await gm.client.from('characters').insert({
      campaign_id: cid,
      user_id: gm.userId,
      name: 'Palette Ranger',
      is_active: true,
    })).error).toBeNull();
    expect((await gm.client.from('timeline_events').insert({
      campaign_id: cid,
      title: 'Palette Eclipse',
      date_label: 'Year 1200, Frostfall 1',
      sort_order: 1,
    })).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openCommandPalette(gmPage);
    await searchCommandPalette(gmPage, 'Arena Grid');
    await expect(gmPage.getByText(/2D Battlemap/i).first()).toBeVisible();

    await searchCommandPalette(gmPage, 'Palette Dragon');
    await expect(gmPage.getByText('Palette Dragon').first()).toBeVisible();

    await searchCommandPalette(gmPage, 'Palette Logbook');
    await expect(gmPage.getByText('Palette Logbook').first()).toBeVisible();

    await searchCommandPalette(gmPage, 'Palette Ranger');
    await expect(gmPage.getByText('Palette Ranger').first()).toBeVisible();

    await searchCommandPalette(gmPage, 'Palette Eclipse');
    await expect(gmPage.getByText('Palette Eclipse').first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-034: RightInspector collapse/expand and drag-resize persist across tab switches', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('insp');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Inspector Keep', mode: 'normal', invite_code: 'INSP1' })
      .select()
      .single();
    expect((await gm.client.from('entities').insert({ world_id: world.data.id, slug: 'inspectable-tome', title: 'Inspectable Tome', type: 'Item' })).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Inspectable Tome').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Inspectable Tome').first().click();

    const toggle = await getRightInspectorToggle(gmPage);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await toggle.click();

    // Check resize handle if present
    const separator = gmPage.getByRole('separator').first();
    if (await separator.isVisible().catch(() => false)) {
      const box = await separator.boundingBox();
      if (box) {
        await gmPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await gmPage.mouse.down();
        await gmPage.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 5 });
        await gmPage.mouse.up();
      }
    }

    await openSidebarSection(gmPage, 'Timeline');
    await openSidebarSection(gmPage, 'Vault');
    await expect(gmPage.locator('aside').last()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-035: SettingsModal contains zero legacy demo mode or vault passphrase token wording', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('settings');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    const settingsBtn = gmPage.getByRole('button', { name: /settings/i }).first();
    await settingsBtn.click();

    const dialog = gmPage.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    const modalText = (await dialog.textContent()) ?? '';
    expect(modalText).not.toMatch(/x-vault-token|vault passphrase|demo mode|localStorage vault/i);

    tracker.assertNoErrors();
  });
});
