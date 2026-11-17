import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { XSS_AND_CSS_PAYLOADS } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-08 Negative & Boundary: Note/Journal HTML & Scoped CSS Sanitizer', () => {
  test('T2-036: <script> tag payload in shared journal/lore note is stripped and never executes', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Sanitizer Vault', mode: 'normal', invite_code: 'SAN01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SAN01' });

    await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'Script Test Note',
      content: XSS_AND_CSS_PAYLOADS.scriptTag,
      share_scope: 'campaign',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Script Test Note').first().click();

    await expect(playerAPage.getByText('Innocent lore').first()).toBeVisible({ timeout: 10_000 });
    expect(
      await playerAPage.evaluate(() => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered)),
    ).toBe(false);
    expect(await playerAPage.locator('main script, .ProseMirror script, [data-testid*="note"] script').count()).toBe(0);

    tracker.assertNoErrors();
  });

  test('T2-037: onerror= and onload= event handler payloads are stripped from rendered HTML', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Event Handler Vault', mode: 'normal', invite_code: 'SAN02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SAN02' });

    await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'Handler Test Note',
      content: `${XSS_AND_CSS_PAYLOADS.imgOnError}\n${XSS_AND_CSS_PAYLOADS.svgOnload}`,
      share_scope: 'campaign',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Handler Test Note').first().click();

    await playerAPage.waitForTimeout(300);
    expect(
      await playerAPage.evaluate(() => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered)),
    ).toBe(false);
    expect(await playerAPage.locator('[onerror], [onload]').count()).toBe(0);

    tracker.assertNoErrors({
      allowConsoleErrorPatterns: [/ERR_UNKNOWN_URL_SCHEME/i],
    });
  });

  test('T2-038: javascript: href link payload is neutralized cleanly', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Link Sanitizer Vault', mode: 'normal', invite_code: 'SAN03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SAN03' });

    await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'Trap Link Note',
      content: XSS_AND_CSS_PAYLOADS.javascriptHref,
      share_scope: 'campaign',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Trap Link Note').first().click();

    const jsLinks = await playerAPage.locator('a[href^="javascript:" i]').count();
    expect(jsLinks).toBe(0);
    expect(
      await playerAPage.evaluate(() => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered)),
    ).toBe(false);

    tracker.assertNoErrors();
  });

  test('T2-039: CSS breakout payload does not alter TopHeader or LeftSidebar styling', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'CSS Breakout Vault', mode: 'normal', invite_code: 'SAN04' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SAN04' });

    await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'CSS Breakout Note',
      content: XSS_AND_CSS_PAYLOADS.cssBreakout,
      share_scope: 'campaign',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('CSS Breakout Note').first().click();

    await expect(playerAPage.getByText('Note text').first()).toBeVisible({ timeout: 10_000 });

    const shellStyles = await playerAPage.evaluate(() => {
      const bodyCs = window.getComputedStyle(document.body);
      const header = document.querySelector('header');
      const headerCs = header ? window.getComputedStyle(header) : null;
      return {
        bodyBg: bodyCs.backgroundColor,
        bodyOpacity: bodyCs.opacity,
        headerDisplay: headerCs?.display ?? 'block',
      };
    });

    expect(shellStyles.bodyBg).not.toBe('rgb(255, 0, 123)');
    expect(Number(shellStyles.bodyOpacity)).toBeGreaterThan(0.5);
    expect(shellStyles.headerDisplay).not.toBe('none');

    tracker.assertNoErrors();
  });

  test('T2-040: Obfuscated nested <scr<script>ipt> and data:text/html iframe are stripped', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Obfuscated XSS Vault', mode: 'normal', invite_code: 'SAN05' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SAN05' });

    const obfuscated = [
      '<p>Safe summary</p>',
      '<scr<script>ipt>window.__e2eXssTriggered=true;</script>',
      '<iframe src="data:text/html,<script>window.__e2eXssTriggered=true</script>"></iframe>',
    ].join('\n');

    await gm.client.from('journal_pages').insert({
      campaign_id: cid,
      owner_id: gm.userId,
      title: 'Obfuscated Note',
      content: obfuscated,
      share_scope: 'campaign',
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Journals');
    await playerAPage.getByText('Obfuscated Note').first().click();

    await expect(playerAPage.getByText('Safe summary').first()).toBeVisible({ timeout: 10_000 });
    expect(await playerAPage.locator('iframe[src^="data:text/html" i]').count()).toBe(0);
    expect(
      await playerAPage.evaluate(() => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered)),
    ).toBe(false);

    tracker.assertNoErrors();
  });
});
