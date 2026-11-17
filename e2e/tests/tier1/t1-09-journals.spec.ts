import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser, assertSupabaseRejected } from '../../helpers/protocolAdmin.js';
import {
  createJournalPage,
  openJournalShareModal,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-09: Player Journals & Granular Page-Level Sharing', () => {
  test('T1-041: player creates a personal journal page that persists in Supabase journal_pages', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('jowner');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Journal Keep', mode: 'west_marches', invite_code: 'JRN01' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN01' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    const insertPromise = playerAPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/journal_pages') && res.request().method() === 'POST',
    );
    await createJournalPage(playerAPage, 'Kaelen Field Notes');
    const resp = await insertPromise;
    expect(resp.ok()).toBe(true);

    await expect
      .poll(async () => {
        const dbPages = await player.client
          .from('journal_pages')
          .select('title, share_scope')
          .eq('campaign_id', world.data.id)
          .eq('owner_id', player.userId);
        return dbPages.data?.some((p) => p.title === 'Kaelen Field Notes') ?? false;
      })
      .toBe(true);

    tracker.assertNoErrors();
  });

  test('T1-042: player updates and deletes their own journal page', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('jcrud');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Journal CRUD', mode: 'normal', invite_code: 'JCRUD' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'JCRUD' });

    const pageRow = await player.client
      .from('journal_pages')
      .insert({
        campaign_id: world.data.id,
        owner_id: player.userId,
        title: 'Draft Log',
        content: '<p>Initial text</p>',
        share_scope: 'private',
      })
      .select()
      .single();
    expect(pageRow.error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Draft Log').first().click();

    const titleField = playerAPage.getByLabel('Journal Page Title').first();
    await titleField.fill('Updated Log');
    await titleField.blur();

    await expect
      .poll(async () => (await player.client.from('journal_pages').select('title').eq('id', pageRow.data.id).single()).data?.title)
      .toBe('Updated Log');

    await playerAPage.getByRole('button', { name: /delete journal page|delete/i }).first().click();

    await expect
      .poll(async () => (await player.client.from('journal_pages').select('id').eq('id', pageRow.data.id)).data?.length ?? 0)
      .toBe(0);

    tracker.assertNoErrors();
  });

  test('T1-043: sharing journal page as "Whole Campaign" makes it visible in Shared With Me for other members', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pACreds = makeUserCredentials('jsharer');
    const pBCreds = makeUserCredentials('jviewer');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Shared Lore Hall', mode: 'west_marches', invite_code: 'JALL1' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JALL1' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JALL1' });

    const jp = await pA.client.from('journal_pages').insert({
      campaign_id: world.data.id,
      owner_id: pA.userId,
      title: 'Expedition Briefing',
      content: '<p>Meet at north gate.</p>',
      share_scope: 'private',
    });
    expect(jp.error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Expedition Briefing').first().click();

    await openJournalShareModal(playerAPage);
    await playerAPage.getByRole('button', { name: /whole campaign/i }).first().click();
    const saveShareBtn = playerAPage.getByRole('button', { name: /save sharing/i }).first();
    await saveShareBtn.click();
    await expect(saveShareBtn).not.toBeVisible();

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await expect(playerBPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerBPage, 'Journals');
    await playerBPage.getByRole('button', { name: /^Shared/i }).first().click();
    await expect(playerBPage.getByText('Expedition Briefing').first()).toBeVisible({ timeout: 15_000 });

    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });

  test('T1-044: sharing journal page with Specific Players read-only allows viewing but blocks editing', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pACreds = makeUserCredentials('jro_a');
    const pBCreds = makeUserCredentials('jro_b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'ReadOnly Archive', mode: 'normal', invite_code: 'JRO01' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRO01' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRO01' });

    const pageRow = await pA.client
      .from('journal_pages')
      .insert({
        campaign_id: world.data.id,
        owner_id: pA.userId,
        title: 'Read Only Tome',
        content: '<p>Do not alter.</p>',
        share_scope: 'private',
      })
      .select()
      .single();
    expect(pageRow.error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Read Only Tome').first().click();
    await openJournalShareModal(playerAPage);

    await playerAPage.getByRole('button', { name: /specific players/i }).first().click();
    await playerAPage.getByText(new RegExp(pBCreds.displayName, 'i')).first().click();
    const saveShareBtn = playerAPage.getByRole('button', { name: /save sharing/i }).first();
    await saveShareBtn.click();
    await expect(saveShareBtn).not.toBeVisible();

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await expect(playerBPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerBPage, 'Journals');
    await playerBPage.getByRole('button', { name: /^Shared/i }).first().click();
    await expect(playerBPage.getByText('Read Only Tome').first()).toBeVisible({ timeout: 15_000 });
    await playerBPage.getByText('Read Only Tome').first().click();
    await expect(playerBPage.getByText('Do not alter.').first()).toBeVisible();

    await assertSupabaseRejected(
      pB.client.from('journal_pages').update({ content: 'Tampered' }).eq('id', pageRow.data.id).select(),
      'read-only shared journal edit rejected',
    );

    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });

  test('T1-045: sharing journal page with Specific Players (Allow Edit) syncs edits live via Realtime', async ({
    appServer,
    protocolRuntime,
    playerAPage,
    playerBPage,
  }) => {
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pACreds = makeUserCredentials('jrw_a');
    const pBCreds = makeUserCredentials('jrw_b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'CoAuthor Hall', mode: 'normal', invite_code: 'JRW01' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRW01' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRW01' });

    const pageRow = await pA.client
      .from('journal_pages')
      .insert({
        campaign_id: world.data.id,
        owner_id: pA.userId,
        title: 'Shared Party Ledger',
        content: '<p>Gold: 50</p>',
        share_scope: 'selected',
      })
      .select()
      .single();
    expect(pageRow.error).toBeNull();
    expect((await pA.client.from('journal_page_shares').insert({
      page_id: pageRow.data.id,
      shared_with_user_id: pB.userId,
      can_edit: true,
    })).error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Shared Party Ledger').first().click();

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, pBCreds.email, pBCreds.password);
    await expect(playerBPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(playerBPage, 'Journals');
    await playerBPage.getByRole('button', { name: /^Shared/i }).first().click();
    await playerBPage.getByText('Shared Party Ledger').first().click();

    const editorB = playerBPage.locator('[contenteditable="true"], textarea').first();
    await editorB.fill('Gold: 250 collected from dragon hoard');

    await expect(playerAPage.getByText(/250 collected from dragon hoard/i).first()).toBeVisible({ timeout: 15_000 });

    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
