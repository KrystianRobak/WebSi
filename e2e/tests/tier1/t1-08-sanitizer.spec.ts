import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { createJournalPage, openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-08: Note/Journal HTML & Scoped CSS Sanitizer + WikiLinks', () => {
  test('T1-036: rich Markdown formatting renders semantic headings, bold, lists, and blockquotes', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('mdown');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Grimoire Hall', mode: 'normal', invite_code: 'MDN01' })
      .select()
      .single();
    expect((await gm.client.from('entities').insert({
      world_id: world.data.id,
      slug: 'ancient-codex',
      title: 'Ancient Codex',
      type: 'Item',
      content: '<h2>Codex Heading</h2><p><strong>Arcane</strong> text</p><ul><li>Rune One</li></ul>',
    })).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Ancient Codex').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Ancient Codex').first().click();

    await expect(gmPage.getByRole('heading', { name: 'Codex Heading' }).first()).toBeVisible();
    await expect(gmPage.getByText('Arcane').first()).toBeVisible();
    await expect(gmPage.getByText('Rune One').first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-037: [[WikiLink]] inside note or journal navigates directly to the linked Lore entity tab', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('wikilink');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Wiki Keep', mode: 'normal', invite_code: 'WIKI1' })
      .select()
      .single();

    expect((await gm.client.from('entities').insert([
      {
        world_id: world.data.id,
        slug: 'high-harbor',
        title: 'High Harbor',
        type: 'Location',
        content: '<p>Home of [[Captain Thorne]].</p>',
      },
      {
        world_id: world.data.id,
        slug: 'captain-thorne',
        title: 'Captain Thorne',
        type: 'Character',
        content: '<p>Master of the fleet.</p>',
      },
    ])).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('High Harbor').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('High Harbor').first().click();

    const wikiLink = gmPage.getByRole('button', { name: /Captain Thorne/i }).or(
      gmPage.getByRole('link', { name: /Captain Thorne/i }),
    ).or(gmPage.locator('[data-wikilink="Captain Thorne"]')).first();
    await wikiLink.click();

    await expect(gmPage.getByText('Master of the fleet.').first()).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T1-038: valid https:// image tag renders inside note/journal without sanitization stripping', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('imgok');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Gallery Hall', mode: 'normal', invite_code: 'IMG01' })
      .select()
      .single();

    expect((await gm.client.from('entities').insert({
      world_id: world.data.id,
      slug: 'sigil-crest',
      title: 'Sigil Crest',
      type: 'Item',
      content: '<p>Crest:</p><img src="https://example.com/crest.png" alt="Guild Crest" />',
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
    await expect(gmPage.getByText('Sigil Crest').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Sigil Crest').first().click();

    const img = gmPage.locator('img[alt="Guild Crest"]').first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('src', 'https://example.com/crest.png');

    tracker.assertNoErrors();
  });

  test('T1-039: scoped <style> block styles only the note container without affecting outer shell', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('scopedcss');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Style Sandbox', mode: 'normal', invite_code: 'CSS01' })
      .select()
      .single();

    expect((await gm.client.from('entities').insert({
      world_id: world.data.id,
      slug: 'styled-scroll',
      title: 'Styled Scroll',
      type: 'History',
      content: '<style>.scroll-callout { color: rgb(212, 175, 55); }</style><div class="scroll-callout">Golden Decree</div>',
    })).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Styled Scroll').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Styled Scroll').first().click();

    const callout = gmPage.getByText('Golden Decree').first();
    await expect(callout).toBeVisible();
    const headerBg = await gmPage.locator('header').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(headerBg).not.toBe('rgb(255, 0, 123)');

    tracker.assertNoErrors();
  });

  test('T1-040: safe inline spans and attributes inside journal page round-trip across reload', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const playerCreds = makeUserCredentials('safespan');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, playerCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Journal Safe', mode: 'normal', invite_code: 'SAFE1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'SAFE1' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerCreds.email, playerCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await createJournalPage(playerAPage, 'Safe Inline Note');
    const editor = playerAPage.locator('[contenteditable="true"], textarea').first();
    await editor.fill('Session log with **bold insight** and clear text.');

    await expect
      .poll(async () => {
        const res = await player.client
          .from('journal_pages')
          .select('title, content')
          .eq('campaign_id', world.data.id)
          .eq('owner_id', player.userId);
        return res.data?.some(
          (p) => p.title === 'Safe Inline Note' && p.content.includes('bold insight'),
        ) ?? false;
      })
      .toBe(true);

    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await openSidebarSection(playerAPage, 'Journals');
    await expect(playerAPage.getByText('Safe Inline Note').first()).toBeVisible({ timeout: 15_000 });
    await playerAPage.getByText('Safe Inline Note').first().click();
    await expect(playerAPage.getByText(/bold insight/i).first()).toBeVisible();

    tracker.assertNoErrors();
  });
});
