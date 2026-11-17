import fs from 'node:fs/promises';
import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import {
  createValidCampaignArchiveV2,
  makeUserCredentials,
  ROLL20_CUSTOM_SHEET_SAMPLE,
} from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { openProfileCampaignHub, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-06: JSON Campaign Archive v2 Export & UUID-Remapped Import', () => {
  test('T1-026: GM exports CampaignArchiveV2 JSON file download from TopHeader', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('expgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Export Harbor', mode: 'west_marches', invite_code: 'EXP01' })
      .select()
      .single();
    const e1 = await gm.client.from('entities').insert({
      world_id: world.data.id,
      slug: 'harbor-lighthouse',
      title: 'Harbor Lighthouse',
      type: 'Location',
    });
    expect(e1.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await gmPage.locator('header').getByRole('button', { name: /export/i }).first().click();
    const downloadPromise = gmPage.waitForEvent('download');
    await gmPage.getByRole('button', { name: /export archive v2 json/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/i);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const parsed = JSON.parse(await fs.readFile(filePath!, 'utf8')) as Record<string, unknown>;
    expect(parsed.version).toBe(2);
    expect((parsed.campaign as Record<string, unknown>).name).toBe('Export Harbor');

    tracker.assertNoErrors();
  });

  test('T1-027: exported CampaignArchiveV2 JSON preserves campaign metadata, calendar_config, and sheet templates', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('metaexp');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({
        name: 'Chronicle Vault',
        mode: 'west_marches',
        invite_code: 'META1',
        calendar_config: {
          eraName: 'Fourth Dawn',
          months: [
            { name: 'Frostfall', days: 30 },
            { name: 'Suncrest', days: 30 },
          ],
          weekdays: ['Moonday', 'Starday'],
          currentYear: 901,
          currentMonthIndex: 0,
          currentDay: 12,
        },
      })
      .select()
      .single();

    const tplRes = await gm.client.from('character_sheet_templates').insert({
      campaign_id: world.data.id,
      name: ROLL20_CUSTOM_SHEET_SAMPLE.name,
      html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
      css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
      schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson) as Record<string, unknown>,
    });
    expect(tplRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await gmPage.locator('header').getByRole('button', { name: /export/i }).first().click();
    const downloadPromise = gmPage.waitForEvent('download');
    await gmPage.getByRole('button', { name: /export archive v2 json/i }).click();
    const download = await downloadPromise;
    const raw = await fs.readFile((await download.path())!, 'utf8');
    const archive = JSON.parse(raw) as Record<string, unknown>;

    const campaign = archive.campaign as Record<string, unknown>;
    expect(campaign.mode).toBe('west_marches');
    expect((campaign.calendar_config as Record<string, unknown>).eraName).toBe('Fourth Dawn');
    const templates = archive.sheetTemplates as Array<Record<string, unknown>>;
    expect(templates.some((t) => t.name === ROLL20_CUSTOM_SHEET_SAMPLE.name)).toBe(true);

    tracker.assertNoErrors();
  });

  test('T1-028: importing CampaignArchiveV2 JSON remaps all UUIDs and creates an independent campaign', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }, testInfo) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('impgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    const archive = createValidCampaignArchiveV2({ name: 'Remapped Archipelago', mode: 'west_marches' });
    const oldWorldId = (archive.campaign as Record<string, unknown>).id as string;
    const oldEntityId = (archive.entities as Array<Record<string, unknown>>)[0].id as string;
    const jsonPath = testInfo.outputPath('archive-import.json');
    await fs.writeFile(jsonPath, JSON.stringify(archive), 'utf8');

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    const fileInput = gmPage.locator('input[type="file"][accept*="json"]').first();
    await fileInput.setInputFiles(jsonPath);

    await expect(gmPage.getByText(/Remapped Archipelago/i).first()).toBeVisible({ timeout: 15_000 });

    const newWorld = await gm.client
      .from('worlds')
      .select('id, mode')
      .eq('name', 'Remapped Archipelago (Imported)')
      .single();
    expect(newWorld.error).toBeNull();
    expect(newWorld.data?.id).not.toBe(oldWorldId);

    const newEntities = await gm.client
      .from('entities')
      .select('id, title, world_id')
      .eq('world_id', newWorld.data!.id);
    expect(newEntities.data).toHaveLength(1);
    expect(newEntities.data?.[0].id).not.toBe(oldEntityId);
    expect(newEntities.data?.[0].title).toBe('Aldric the Bold');

    tracker.assertNoErrors();
  });

  test('T1-029: importing archive containing data: URL image uploads it to vault-assets Storage and replaces inline URI', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }, testInfo) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('imgimp');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    const archive = createValidCampaignArchiveV2({
      name: 'Painted Archipelago',
      includeDataUrlImage: true,
    });
    const jsonPath = testInfo.outputPath('archive-with-data-url.json');
    await fs.writeFile(jsonPath, JSON.stringify(archive), 'utf8');

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openProfileCampaignHub(gmPage);
    const uploadPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/storage/v1/object/vault-assets') && res.request().method() === 'POST',
    );
    await gmPage.locator('input[type="file"][accept*="json"]').first().setInputFiles(jsonPath);
    const uploadResp = await uploadPromise;
    expect(uploadResp.ok()).toBe(true);

    let importedWorldId = '';
    await expect
      .poll(async () => {
        const res = await gm.client
          .from('worlds')
          .select('id')
          .eq('name', 'Painted Archipelago (Imported)')
          .maybeSingle();
        importedWorldId = res.data?.id ?? '';
        return Boolean(importedWorldId);
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const res = await gm.client
          .from('maps')
          .select('paint_url')
          .eq('world_id', importedWorldId)
          .maybeSingle();
        return res.data?.paint_url ?? null;
      })
      .toContain('/storage/v1/object/public/vault-assets/');

    const mapsRes = await gm.client.from('maps').select('paint_url').eq('world_id', importedWorldId).single();
    expect(String(mapsRes.data?.paint_url)).not.toMatch(/^data:/);

    tracker.assertNoErrors();
  });

  test('T1-030: full CampaignArchiveV2 round-trip export -> import -> verify entities, pins, timeline, and templates', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }, testInfo) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('roundtrip');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);

    const srcWorld = await gm.client
      .from('worlds')
      .insert({ name: 'Origin Kingdom', mode: 'normal', invite_code: 'ORIG1' })
      .select()
      .single();
    const srcMap = await gm.client
      .from('maps')
      .insert({ world_id: srcWorld.data.id, name: 'Origin Map', kind: '3d' })
      .select()
      .single();
    expect(srcMap.error).toBeNull();
    const srcEntity = await gm.client
      .from('entities')
      .insert({ world_id: srcWorld.data.id, slug: 'keep-of-dawn', title: 'Keep of Dawn', type: 'Location' })
      .select()
      .single();
    expect(srcEntity.error).toBeNull();
    const pinRes = await gm.client.from('map_pins').insert({
      map_id: srcMap.data.id,
      entity_id: srcEntity.data.id,
      label: 'Dawn Gate',
      x: 5,
      y: 1,
      z: 3,
    });
    expect(pinRes.error).toBeNull();
    const tlRes = await gm.client.from('timeline_events').insert({
      campaign_id: srcWorld.data.id,
      title: 'Coronation Day',
      date_label: 'Year 500, Frostfall 1',
      sort_order: 1,
      is_gm_only: false,
    });
    expect(tlRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await gmPage.locator('header').getByRole('button', { name: /export/i }).first().click();
    const downloadPromise = gmPage.waitForEvent('download');
    await gmPage.getByRole('button', { name: /export archive v2 json/i }).click();
    const download = await downloadPromise;
    const exportedPath = testInfo.outputPath('roundtrip.json');
    await download.saveAs(exportedPath);

    await openProfileCampaignHub(gmPage);
    await gmPage.locator('input[type="file"][accept*="json"]').first().setInputFiles(exportedPath);

    await expect
      .poll(async () => {
        const res = await gm.client.from('worlds').select('id').eq('name', 'Origin Kingdom (Imported)');
        return res.data?.length ?? 0;
      })
      .toBe(1);

    const clonedWorld = (await gm.client.from('worlds').select('id').eq('name', 'Origin Kingdom (Imported)').single()).data!;
    await expect
      .poll(
        async () =>
          (await gm.client.from('timeline_events').select('id').eq('campaign_id', clonedWorld.id)).data?.length ?? 0,
        { timeout: 10_000 }
      )
      .toBe(1);
    expect((await gm.client.from('entities').select('id').eq('world_id', clonedWorld.id)).data).toHaveLength(1);
    const clonedMaps = (await gm.client.from('maps').select('id').eq('world_id', clonedWorld.id)).data!;
    expect(clonedMaps).toHaveLength(1);
    expect((await gm.client.from('map_pins').select('id').eq('map_id', clonedMaps[0].id)).data).toHaveLength(1);

    tracker.assertNoErrors();
  });
});
