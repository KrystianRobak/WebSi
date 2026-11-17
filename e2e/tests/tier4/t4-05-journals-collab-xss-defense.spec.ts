import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { XSS_AND_CSS_PAYLOADS } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('T4-05: Player Journals, Granular Sharing, Collaborative Edit & XSS/CSS Defense', () => {
  test('T4-05: Private journal isolated -> shared with Player B (can_edit=true) -> XSS/CSS neutralized -> live co-edit converges', async ({
    gmPage,
    playerAPage,
    playerBPage,
    appServer,
    protocolRuntime,
  }) => {
    const trackerGm = attachPageErrorTracker(gmPage);
    const trackerA = attachPageErrorTracker(playerAPage);
    const trackerB = attachPageErrorTracker(playerBPage);

    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Grimoire Guild', mode: 'west_marches', invite_code: 'JRN45' })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN45' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'JRN45' });

    await gm.client.from('entities').insert({
      world_id: cid,
      slug: 'aldric-the-bold',
      title: 'Aldric the Bold',
      type: 'NPC',
      metadata: { is_gm_only: false },
    });

    // Player A writes private note containing WikiLink + combined XSS/CSS breakout payload
    const pageRow = await playerA.client
      .from('journal_pages')
      .insert({
        campaign_id: cid,
        owner_id: playerA.userId,
        title: 'Expedition Field Log',
        content: XSS_AND_CSS_PAYLOADS.combinedDangerousNote,
        share_scope: 'private',
      })
      .select()
      .single();
    const pageId = pageRow.data.id as string;

    // Verify private isolation from GM and Player B
    expect((await gm.client.from('journal_pages').select('*').eq('id', pageId)).data).toEqual([]);
    expect((await playerB.client.from('journal_pages').select('*').eq('id', pageId)).data).toEqual([]);

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

    // GM & Player B do not see private note yet
    await openSidebarSection(gmPage, 'Journals');
    await openSidebarSection(playerBPage, 'Journals');
    await expect(gmPage.getByText('Expedition Field Log')).toHaveCount(0);
    await expect(playerBPage.getByText('Expedition Field Log')).toHaveCount(0);

    // Player A shares journal with Player B (can_edit = true)
    await playerA.client.from('journal_pages').update({ share_scope: 'selected' }).eq('id', pageId);
    await playerA.client.from('journal_page_shares').insert({
      page_id: pageId,
      shared_with_user_id: playerB.userId,
      can_edit: true,
    });

    // Player B sees the shared note via Realtime/refresh; GM still does not
    await playerBPage.getByRole('button', { name: /^Shared \(/i }).first().click();
    await expect(playerBPage.getByText('Expedition Field Log').first()).toBeVisible({ timeout: 10_000 });
    await playerBPage.getByText('Expedition Field Log').first().click();
    await expect(playerBPage.getByText(/Expedition notes referencing/i).first()).toBeVisible({ timeout: 10_000 });

    // Verify XSS & CSS breakout neutralized on Player B's browser
    expect(
      await playerBPage.evaluate(() => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered)),
    ).toBe(false);
    const bodyBg = await playerBPage.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).not.toBe('rgb(255, 0, 123)');
    expect(await playerBPage.locator('a[href^="javascript:" i], [onerror], [onload]').count()).toBe(0);
    await expect(gmPage.getByText('Expedition Field Log')).toHaveCount(0);

    // Collaborative edit from Player B converges back to Player A
    await playerB.client
      .from('journal_pages')
      .update({ content: '<p>Co-authored safe expedition update</p>' })
      .eq('id', pageId);

    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Expedition Field Log').first().click();
    await expect(playerAPage.getByText('Co-authored safe expedition update').first()).toBeVisible({ timeout: 10_000 });

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
