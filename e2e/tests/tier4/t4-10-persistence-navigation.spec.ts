import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  openCommandPalette,
  openSidebarSection,
  openTimelinePane,
  searchCommandPalette,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('T4-10: Full Session Persistence, Ctrl+K Command Palette & Cross-Feature Recovery', () => {
  test('T4-10: GM & Player A reload across active tabs -> sessions auto-restore without localStorage vault -> CommandPalette navigates across 2D Battlemaps, characters, journals & timeline', async ({
    gmPage,
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);

    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Persistent Citadel', mode: 'normal', invite_code: 'PERS50' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'PERS50' });

    await gm.client.from('maps').insert({
      world_id: cid,
      name: 'Obsidian Battlegrid',
      kind: '2d',
      battlemap: { tokens: [], walls: [], lights: [] },
    });
    await gm.client.from('entities').insert({
      world_id: cid,
      slug: 'citadel-archivist',
      title: 'Citadel Archivist',
      type: 'NPC',
      metadata: { is_gm_only: false },
    });
    await playerA.client.from('characters').insert({
      campaign_id: cid,
      user_id: playerA.userId,
      name: 'Talia Stormcaller',
      is_active: true,
    });
    await playerA.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: playerA.userId,
      title: 'Stormcaller Travel Notes',
      content: '<p>Crossed the northern bridge.</p>',
      share_scope: 'private',
    });
    await gm.client.from('timeline_events').insert({
      campaign_id: cid,
      title: 'Treaty of Obsidian',
      date_label: 'Year 1150 Frostmoon 5',
      sort_order: 1,
      is_gm_only: false,
    });

    await Promise.all([gmPage.goto(appServer.url), playerAPage.goto(appServer.url)]);
    await Promise.all([
      signInViaAuthScreen(gmPage, gm.email, gm.password),
      signInViaAuthScreen(playerAPage, playerA.email, playerA.password),
    ]);

    // Verify no legacy localStorage vault fallback keys exist
    const legacyKeysPresent = await playerAPage.evaluate(() => {
      return Object.keys(window.localStorage).filter((k) =>
        ['aethelgard_vault_unlocked', 'aethelgard_vault_token', 'vault_offline_cache'].includes(k),
      );
    });
    expect(legacyKeysPresent).toEqual([]);

    // Reload both browsers -> sessions auto-restore directly into workspace
    await Promise.all([gmPage.reload(), playerAPage.reload()]);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    // Verify CommandPalette navigation across 2D Battlemap, Character, Journal, and Timeline
    await openCommandPalette(playerAPage);
    await searchCommandPalette(playerAPage, 'Obsidian Battlegrid');
    await expect(playerAPage.getByRole('dialog').getByText(/2D Battlemap/i).first()).toBeVisible({ timeout: 10_000 });
    await playerAPage.getByRole('dialog').getByText('Obsidian Battlegrid').first().click();

    await openCommandPalette(playerAPage);
    await searchCommandPalette(playerAPage, 'Talia Stormcaller');
    await expect(playerAPage.getByText('Talia Stormcaller').first()).toBeVisible({ timeout: 10_000 });
    await playerAPage.keyboard.press('Escape');

    await openSidebarSection(playerAPage, 'Journals');
    await expect(playerAPage.getByText('Stormcaller Travel Notes').first()).toBeVisible({ timeout: 10_000 });

    await openTimelinePane(gmPage);
    await expect(gmPage.getByText('Treaty of Obsidian').first()).toBeVisible({ timeout: 10_000 });

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
  });
});
