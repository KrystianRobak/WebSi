import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials, XSS_AND_CSS_PAYLOADS } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  createCharacterInPane,
  getGmModeToggle,
  getRightInspectorToggle,
  openCommandPalette,
  openJournalShareModal,
  openSidebarSection,
  openTimelinePane,
  searchCommandPalette,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('Tier 3 Pairwise Integration: Journals, Sanitizer, Timeline & Member Privacy (T3-19..T3-24)', () => {
  test('T3-19: [UF-08 x UF-09] Shared journal with XSS/CSS breakout neutralizes payloads while syncing live collaborative edits', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const tA = attachPageErrorTracker(playerAPage);
    const tB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm19'));
    const pACreds = makeUserCredentials('t3_p19a');
    const pBCreds = makeUserCredentials('t3_p19b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Sanitized Journals', mode: 'normal', invite_code: 'SJ191' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SJ191' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'SJ191' });

    const pageRow = await pA.client
      .from('journal_pages')
      .insert({
        campaign_id: world.data.id,
        owner_id: pA.userId,
        title: 'Expedition Trap Note',
        content: XSS_AND_CSS_PAYLOADS.combinedDangerousNote,
        share_scope: 'selected',
      })
      .select()
      .single();
    await pA.client.from('journal_page_shares').insert({
      page_id: pageRow.data.id,
      shared_with_user_id: pB.userId,
      can_edit: true,
    });

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await openSidebarSection(playerBPage, 'Journals');
    await playerBPage.getByRole('button', { name: /^Shared \(/i }).first().click();
    await playerBPage.getByText('Expedition Trap Note').first().click();

    const xssFired = await playerBPage.evaluate(
      () => (window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered === true,
    );
    expect(xssFired).toBe(false);
    const bodyBg = await playerBPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).not.toBe('rgb(255, 0, 123)');

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Expedition Trap Note').first().click();

    const editorB = playerBPage.locator('[contenteditable="true"], textarea').first();
    await editorB.fill('Clean collaborative update after trap check');
    await playerBPage.getByRole('button', { name: /save/i }).first().click().catch(() => {});

    await expect(playerAPage.getByText(/Clean collaborative update/i).first()).toBeVisible({ timeout: 15_000 });

    tA.assertNoErrors();
    tB.assertNoErrors();
  });

  test('T3-20: [UF-09 x UF-07] Campaign-shared journal appears in CommandPalette and navigates [[WikiLink]] to Lore entity', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const tA = attachPageErrorTracker(playerAPage);
    const tB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm20'));
    const pACreds = makeUserCredentials('t3_p20a');
    const pBCreds = makeUserCredentials('t3_p20b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Indexed Journals', mode: 'normal', invite_code: 'IJ201' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'IJ201' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'IJ201' });

    await gm.client.from('entities').insert({
      world_id: world.data.id,
      slug: 'sunken-citadel',
      title: 'Sunken Citadel',
      type: 'Location',
      content: '<p>Beneath the tide.</p>',
    });
    await pA.client.from('journal_pages').insert({
      campaign_id: world.data.id,
      owner_id: pA.userId,
      title: 'Tidewater Clue',
      content: '<p>Follow map to [[Sunken Citadel]].</p>',
      share_scope: 'private',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Tidewater Clue').first().click();
    await openJournalShareModal(playerAPage);
    await playerAPage.getByRole('button', { name: /Whole Campaign/i }).first().click();
    await playerAPage.getByRole('button', { name: /Save Sharing/i }).first().click();

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await openCommandPalette(playerBPage);
    await searchCommandPalette(playerBPage, 'Tidewater Clue');
    await playerBPage.getByText('Tidewater Clue').first().click();

    const link = playerBPage.getByRole('button', { name: /Sunken Citadel/i }).or(
      playerBPage.locator('[data-wikilink="Sunken Citadel"]'),
    ).first();
    await link.click();
    await expect(playerBPage.getByText('Beneath the tide.').first()).toBeVisible({ timeout: 10_000 });

    tA.assertNoErrors();
    tB.assertNoErrors();
  });

  test('T3-21: [UF-10 x UF-04] GM toggling gmMode=false hides GM-only timeline events; player view enforces same filter', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_gm21');
    const pCreds = makeUserCredentials('t3_p21');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Calendar Secrets', mode: 'normal', invite_code: 'CS211' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'CS211' });

    await gm.client.from('timeline_events').insert([
      { campaign_id: world.data.id, title: 'Public Solstice', date_label: 'Year 800, Dawn 1', sort_order: 80001, is_gm_only: false },
      { campaign_id: world.data.id, title: 'GM Assassin Plot', date_label: 'Year 801, Dawn 2', sort_order: 80102, is_gm_only: true },
    ]);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openTimelinePane(gmPage);
    await expect(gmPage.getByText('GM Assassin Plot').first()).toBeVisible();

    await (await getGmModeToggle(gmPage)).click();
    await expect(gmPage.getByText('GM Assassin Plot')).not.toBeVisible();
    await expect(gmPage.getByText('Public Solstice').first()).toBeVisible();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openTimelinePane(playerAPage);
    await expect(playerAPage.getByText('Public Solstice').first()).toBeVisible();
    await expect(playerAPage.getByText('GM Assassin Plot')).not.toBeVisible();

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });

  test('T3-22: [UF-10 x UF-07] Calendar stepper + CommandPalette navigation to linked Session entity & RightInspector graph', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_gm22');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({
        name: 'Timeline Inspector',
        mode: 'normal',
        invite_code: 'TI221',
        calendar_config: {
          eraName: 'Golden Era',
          months: [
            { name: 'Dawn', days: 30 },
            { name: 'Dusk', days: 30 },
          ],
          weekdays: ['Day1', 'Day2'],
          currentYear: 200,
          currentMonthIndex: 0,
          currentDay: 1,
        },
      })
      .select()
      .single();

    const ent = await gm.client
      .from('entities')
      .insert({
        world_id: world.data.id,
        slug: 'session-1-awakening',
        title: 'Session 1: Awakening',
        type: 'Session',
        content: '<p>Met at the crossroads.</p>',
      })
      .select()
      .single();
    await gm.client.from('timeline_events').insert({
      campaign_id: world.data.id,
      linked_entity_id: ent.data.id,
      title: 'Crossroads Oath',
      date_label: 'Year 200, Dawn 2',
      sort_order: 20002,
      is_gm_only: false,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openTimelinePane(gmPage);
    await gmPage.getByRole('button', { name: /\+1 day|next day|step day/i }).first().click();

    await openCommandPalette(gmPage);
    await searchCommandPalette(gmPage, 'Crossroads Oath');
    await expect(gmPage.getByText('Crossroads Oath').first()).toBeVisible();
    await gmPage.keyboard.press('Escape');

    await gmPage.getByText(/Crossroads Oath|Session 1: Awakening/i).first().click();
    await expect(gmPage.getByText('Met at the crossroads.').first()).toBeVisible({ timeout: 10_000 });
    await (await getRightInspectorToggle(gmPage)).click();
    await expect(gmPage.locator('aside').last()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T3-23: [UF-04 x UF-09] Private player journals remain hidden from GM even with gmMode=true until shared', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_gm23');
    const pCreds = makeUserCredentials('t3_p23');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Private Diary Keep', mode: 'normal', invite_code: 'PDK23' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'PDK23' });

    await player.client.from('journal_pages').insert({
      campaign_id: world.data.id,
      owner_id: player.userId,
      title: 'Personal Confession',
      content: '<p>Strictly private.</p>',
      share_scope: 'private',
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openSidebarSection(gmPage, 'Journals');
    await expect(gmPage.getByText('Personal Confession')).not.toBeVisible();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Personal Confession').first().click();
    await openJournalShareModal(playerAPage);
    await playerAPage.getByRole('button', { name: /Whole Campaign/i }).first().click();
    await playerAPage.getByRole('button', { name: /Save Sharing/i }).first().click();

    await gmPage.reload({ waitUntil: 'domcontentloaded' });
    await openSidebarSection(gmPage, 'Journals');
    await expect(gmPage.getByText('Personal Confession').first()).toBeVisible({ timeout: 15_000 });

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });

  test('T3-24: [UF-02 x UF-13 x UF-16] Hub join -> Create active WM character -> Jump from Hub -> Accept Quest Board task & reload', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm24'));
    const pCreds = makeUserCredentials('t3_p24');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Grand Guild Frontier', mode: 'west_marches', invite_code: 'GGF24' })
      .select()
      .single();
    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Guild Plaza',
        kind: '2d',
        battlemap: { gridSizePx: 50, width: 700, height: 700, showGrid: true, tokens: [], walls: [], doors: [], lights: [] },
      })
      .select()
      .single();
    const board = await gm.client
      .from('map_quest_boards')
      .insert({ campaign_id: world.data.id, map_id: bmap.data.id, title: 'Plaza Board', x: 4, y: 4, z: 0 })
      .select()
      .single();
    const quest = await gm.client
      .from('guild_quests')
      .insert({ campaign_id: world.data.id, board_id: board.data.id, title: 'Patrol East Road', max_players: 2, status: 'open' })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);

    await openSidebarSection(playerAPage, 'Profile');
    await playerAPage.getByLabel(/invite code/i).or(playerAPage.getByPlaceholder(/invite code/i)).first().fill('GGF24');
    await playerAPage.getByRole('button', { name: /join/i }).first().click();
    await expect(playerAPage.getByText('Grand Guild Frontier').first()).toBeVisible({ timeout: 10_000 });

    await createCharacterInPane(playerAPage, 'Cassian Vale');

    // Jump from Profile Hub My Characters
    await openSidebarSection(playerAPage, 'Profile');
    await expect(playerAPage.getByText('Cassian Vale').first()).toBeVisible({ timeout: 10_000 });
    await playerAPage.getByText('Cassian Vale').first().click();

    // Accept Guild Quest from 2D Battlemap board
    await openSidebarSection(playerAPage, 'Vault');
    await playerAPage.getByText('Guild Plaza').first().click();
    await playerAPage.getByRole('button', { name: /Plaza Board|Quest Board/i }).first().click();
    await playerAPage.getByRole('button', { name: /accept task|accept|sign up/i }).first().click();

    await expect
      .poll(async () => (await gm.client.from('guild_quest_signups').select('id').eq('quest_id', quest.data.id)).data?.length ?? 0)
      .toBe(1);

    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await openSidebarSection(playerAPage, 'Profile');
    await expect(playerAPage.getByText('Cassian Vale').first()).toBeVisible({ timeout: 15_000 });

    tracker.assertNoErrors();
  });
});
