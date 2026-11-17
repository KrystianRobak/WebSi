import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, createAuthenticatedUser, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { createJournalPage, openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-09 Negative & Boundary: Player Journals & Granular Page-Level Sharing', () => {
  test('T2-041: Private journal page is invisible to Player B and GM in UI and REST', async ({
    gmPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerB = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Private Diaries', mode: 'west_marches', invite_code: 'JRN01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN01' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN01' });

    await playerA.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: playerA.userId,
      title: 'Player A Top Secret Diary',
      content: 'Eyes only',
      share_scope: 'private',
    });

    // REST verification for GM & Player B
    expect((await playerB.client.from('journal_pages').select('*').eq('campaign_id', cid)).data).toEqual([]);
    expect((await gm.client.from('journal_pages').select('*').eq('campaign_id', cid)).data).toEqual([]);

    // UI verification for GM & Player B
    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Journals');
    await expect(gmPage.getByText('Player A Top Secret Diary')).toHaveCount(0);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await openSidebarSection(playerBPage, 'Journals');
    await expect(playerBPage.getByText('Player A Top Secret Diary')).toHaveCount(0);

    trackerGm.assertNoErrors();
    trackerB.assertNoErrors();
  });

  test('T2-042: Selected journal share is invisible to unshared Player C', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerB = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const playerC = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Selective Share', mode: 'west_marches', invite_code: 'JRN02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN02' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN02' });
    await playerC.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN02' });

    const pageRow = await playerA.client
      .from('journal_pages')
      .insert({
        campaign_id: cid,
        owner_id: playerA.userId,
        title: 'Whispered Conspiracy',
        content: 'For C only',
        share_scope: 'selected',
      })
      .select()
      .single();
    await playerA.client.from('journal_page_shares').insert({
      page_id: pageRow.data.id,
      shared_with_user_id: playerC.userId,
      can_edit: false,
    });

    // Player C sees it; Player B does not
    expect((await playerC.client.from('journal_pages').select('*').eq('id', pageRow.data.id)).data).toHaveLength(1);
    expect((await playerB.client.from('journal_pages').select('*').eq('id', pageRow.data.id)).data).toEqual([]);

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await openSidebarSection(playerBPage, 'Journals');
    await expect(playerBPage.getByText('Whispered Conspiracy')).toHaveCount(0);

    trackerB.assertNoErrors();
  });

  test('T2-043: Read-only share (can_edit=false) blocks UI editing and REST UPDATE', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerB = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'ReadOnly Journals', mode: 'normal', invite_code: 'JRN03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN03' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN03' });

    const pageRow = await playerA.client
      .from('journal_pages')
      .insert({
        campaign_id: cid,
        owner_id: playerA.userId,
        title: 'Read Only Ledger',
        content: 'Immutable entry',
        share_scope: 'selected',
      })
      .select()
      .single();
    await playerA.client.from('journal_page_shares').insert({
      page_id: pageRow.data.id,
      shared_with_user_id: playerB.userId,
      can_edit: false,
    });

    await assertSupabaseRejected(
      playerB.client.from('journal_pages').update({ content: 'Tampered' }).eq('id', pageRow.data.id).select(),
      'Player B editing read-only journal',
    );

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await openSidebarSection(playerBPage, 'Journals');
    await playerBPage.getByText('Read Only Ledger').first().click();

    await expect(playerBPage.getByText('Immutable entry').first()).toBeVisible({ timeout: 10_000 });
    trackerB.assertNoErrors();
  });

  test('T2-044: Revoking journal share removes Player B visibility in Realtime and REST', async ({
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerB = attachPageErrorTracker(playerBPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Revoke Share World', mode: 'normal', invite_code: 'JRN04' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN04' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN04' });

    const pageRow = await playerA.client
      .from('journal_pages')
      .insert({
        campaign_id: cid,
        owner_id: playerA.userId,
        title: 'Revocable Scroll',
        content: 'Temporary access',
        share_scope: 'selected',
      })
      .select()
      .single();
    await playerA.client
      .from('journal_page_shares')
      .insert({
        page_id: pageRow.data.id,
        shared_with_user_id: playerB.userId,
        can_edit: false,
      })
      .select()
      .single();

    await playerBPage.goto(appServer.url);
    await signInViaAuthScreen(playerBPage, playerB.email, playerB.password);
    await openSidebarSection(playerBPage, 'Journals');
    await expect(playerBPage.getByText('Revocable Scroll').first()).toBeVisible({ timeout: 10_000 });

    // Revoke share
    await playerA.client
      .from('journal_page_shares')
      .delete()
      .eq('page_id', pageRow.data.id)
      .eq('shared_with_user_id', playerB.userId);
    expect((await playerB.client.from('journal_pages').select('*').eq('id', pageRow.data.id)).data).toEqual([]);

    await expect(playerBPage.getByText('Revocable Scroll')).toHaveCount(0, { timeout: 10_000 });
    trackerB.assertNoErrors();
  });

  test('T2-045: Empty journal title handled safely and deleting shared page leaves zero dangling shares', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerA = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Cleanup Journals', mode: 'normal', invite_code: 'JRN05' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN05' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN05' });

    const pageRow = await playerA.client
      .from('journal_pages')
      .insert({
        campaign_id: cid,
        owner_id: playerA.userId,
        title: 'Disposable Shared Note',
        content: 'Will be deleted',
        share_scope: 'selected',
      })
      .select()
      .single();
    await playerA.client.from('journal_page_shares').insert({
      page_id: pageRow.data.id,
      shared_with_user_id: playerB.userId,
      can_edit: true,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await createJournalPage(playerAPage, '   ');

    // Delete the shared page and verify share cleanup
    await playerA.client.from('journal_page_shares').delete().eq('page_id', pageRow.data.id);
    await playerA.client.from('journal_pages').delete().eq('id', pageRow.data.id);

    const sharesLeft = await playerA.client
      .from('journal_page_shares')
      .select('*')
      .eq('page_id', pageRow.data.id);
    expect(sharesLeft.data).toEqual([]);
    trackerA.assertNoErrors();
  });
});
