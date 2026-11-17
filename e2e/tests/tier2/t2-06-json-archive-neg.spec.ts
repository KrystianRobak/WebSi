import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createValidCampaignArchiveV2, MALFORMED_ARCHIVES } from '../../fixtures/sampleData.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { openProfileCampaignHub, signInViaAuthScreen } from '../../helpers/uiActions.js';

async function uploadArchiveJson(page: import('@playwright/test').Page, filename: string, content: string): Promise<void> {
  const fileInput = page.locator('input[type="file"][accept*="json" i], input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles({
      name: filename,
      mimeType: 'application/json',
      buffer: Buffer.from(content, 'utf8'),
    });
    return;
  }
  const importBtn = page.getByRole('button', { name: /import( json| archive| campaign)?/i }).first();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importBtn.click()]);
  await chooser.setFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf8'),
  });
}

test.describe('UF-06 Negative & Boundary: JSON Campaign Archive v2 Import/Export', () => {
  test('T2-026: Malformed JSON syntax rejected via file input without corrupting existing campaign', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Baseline Safe World', mode: 'normal' }).select().single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openProfileCampaignHub(gmPage);

    await uploadArchiveJson(gmPage, 'malformed.json', MALFORMED_ARCHIVES.invalidJson);

    await expect(gmPage.getByText(/invalid|parse|json|error|failed/i).first()).toBeVisible({ timeout: 10_000 });
    const worlds = await gm.client.from('worlds').select('*');
    expect(worlds.data).toHaveLength(1);
    expect(worlds.data?.[0].name).toBe('Baseline Safe World');

    tracker.assertNoErrors();
  });

  test('T2-027: Missing campaign schema and unsupported archive version rejected cleanly', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openProfileCampaignHub(gmPage);

    for (const [label, payload] of [
      ['empty.json', MALFORMED_ARCHIVES.emptyObject],
      ['v99.json', MALFORMED_ARCHIVES.unsupportedVersion],
      ['missing-campaign.json', MALFORMED_ARCHIVES.missingCampaign],
      ['bad-entities.json', MALFORMED_ARCHIVES.invalidEntitiesType],
    ] as const) {
      await uploadArchiveJson(gmPage, label, payload);
      await expect(gmPage.getByText(/invalid|unsupported|version|missing|error|failed/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }

    const worlds = await gm.client.from('worlds').select('*');
    expect(worlds.data).toEqual([]);
    tracker.assertNoErrors();
  });

  test('T2-028: Archive containing data:text/html or javascript: asset URLs rejects or strips dangerous URLs', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const maliciousArchive = createValidCampaignArchiveV2({ name: 'Dangerous URL Archive' });
    (maliciousArchive.maps as Array<Record<string, unknown>>)[0].paint_url =
      'data:text/html,<script>window.__e2eXssTriggered=true</script>';
    (maliciousArchive as Record<string, unknown>).assets = [
      {
        id: '00000000-0000-4000-8000-000000000099',
        name: 'Evil Asset',
        url: 'javascript:window.__e2eXssTriggered=true',
      },
    ];

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openProfileCampaignHub(gmPage);

    await uploadArchiveJson(gmPage, 'dangerous-urls.json', JSON.stringify(maliciousArchive));

    // Either rejected outright or imported with dangerous URLs stripped
    const maps = await gm.client.from('maps').select('*');
    for (const m of maps.data ?? []) {
      expect(String(m.paint_url ?? '')).not.toMatch(/^(javascript:|data:text\/html)/i);
    }
    const assets = await gm.client.from('vault_assets').select('*');
    for (const a of assets.data ?? []) {
      expect(String(a.url ?? '')).not.toMatch(/^(javascript:|data:text\/html)/i);
    }

    const xss = await gmPage.evaluate(
      () => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered),
    );
    expect(xss).toBe(false);
    tracker.assertNoErrors();
  });

  test('T2-029: Non-GM player cannot overwrite GM campaign via archive import or REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Protected Campaign', mode: 'normal', invite_code: 'ARCH01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'ARCH01' });

    // REST overwrite blocked
    await assertSupabaseRejected(
      playerA.client.from('worlds').update({ name: 'Overwritten By Player' }).eq('id', cid).select(),
      'Player overwriting GM world',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);

    // Header import control must not allow overwriting Protected Campaign
    const headerImport = playerAPage.locator('header').getByRole('button', { name: /import/i });
    const count = await headerImport.count();
    if (count > 0) {
      expect(await headerImport.first().isDisabled()).toBe(true);
    }

    const worldCheck = await gm.client.from('worlds').select('name').eq('id', cid).single();
    expect(worldCheck.data?.name).toBe('Protected Campaign');
    tracker.assertNoErrors();
  });

  test('T2-030: Empty valid CampaignArchiveV2 (0 entities, 0 pins, 0 paths) imports cleanly', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const emptyArchive = createValidCampaignArchiveV2({ name: 'Clean Empty Archive' });
    emptyArchive.entities = [];
    emptyArchive.mapPins = [];
    emptyArchive.mapPaths = [];
    emptyArchive.timelineEvents = [];
    emptyArchive.sheetTemplates = [];

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openProfileCampaignHub(gmPage);

    await uploadArchiveJson(gmPage, 'empty-valid.json', JSON.stringify(emptyArchive));

    await expect(gmPage.getByText('Clean Empty Archive').first()).toBeVisible({ timeout: 15_000 });
    const worlds = await gm.client.from('worlds').select('*').ilike('name', 'Clean Empty Archive%');
    expect(worlds.data).toHaveLength(1);

    tracker.assertNoErrors();
  });
});
