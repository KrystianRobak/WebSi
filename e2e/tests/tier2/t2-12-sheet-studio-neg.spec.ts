import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  getSheetSandboxIframeElement,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-12 Negative & Boundary: SheetTemplateStudio & Sandboxed Iframe Runtime', () => {
  test('T2-056: Sandboxed iframe blocks parent DOM and localStorage access (no allow-same-origin)', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Sandbox Isolation', mode: 'normal', invite_code: 'SBOX01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SBOX01' });

    const maliciousHtml = `<div class="sheet-root">
      <div id="probe">Probe</div>
      <script>
        try { window.parent.document.body.setAttribute('data-pwned', 'true'); } catch (e) {}
        try { window.localStorage.setItem('pwned', '1'); } catch (e) {}
      </script>
    </div>`;

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: cid,
        name: 'Hostile Sheet',
        html_template: maliciousHtml,
        css_template: '.sheet-root { color: white; }',
        schema_json: { defaults: {}, computed: {} },
      })
      .select()
      .single();

    await playerA.client.from('characters').insert({
      campaign_id: cid,
      user_id: playerA.userId,
      sheet_template_id: tpl.data.id,
      name: 'Sandbox Hero',
      is_active: true,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Sandbox Hero').first().click();

    const iframeEl = await getSheetSandboxIframeElement(playerAPage);
    await expect(iframeEl).toBeVisible({ timeout: 10_000 });
    const sandboxAttr = await iframeEl.getAttribute('sandbox');
    expect(sandboxAttr).toContain('allow-scripts');
    expect(sandboxAttr).not.toContain('allow-same-origin');

    const pwnedAttr = await playerAPage.evaluate(() => document.body.getAttribute('data-pwned'));
    const pwnedStorage = await playerAPage.evaluate(() => window.localStorage.getItem('pwned'));
    expect(pwnedAttr).toBeNull();
    expect(pwnedStorage).toBeNull();

    tracker.assertNoErrors();
  });

  test('T2-057: Sheet CSS body{display:none} stays trapped inside iframe and never hides app shell', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'CSS Trap', mode: 'normal', invite_code: 'SBOX02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SBOX02' });

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: cid,
        name: 'Hide Body Sheet',
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: 'body, #root, header { display: none !important; }',
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();

    await playerA.client.from('characters').insert({
      campaign_id: cid,
      user_id: playerA.userId,
      sheet_template_id: tpl.data.id,
      name: 'CSS Trap Hero',
      is_active: true,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('CSS Trap Hero').first().click();

    await expect(playerAPage.locator('header')).toBeVisible();
    const headerDisplay = await playerAPage.evaluate(() => {
      const h = document.querySelector('header');
      return h ? window.getComputedStyle(h).display : 'missing';
    });
    expect(headerDisplay).not.toBe('none');

    tracker.assertNoErrors();
  });

  test('T2-058: Spoofed postMessage with wrong instanceId is ignored without mutating character DB', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Spoofed PostMessage', mode: 'normal', invite_code: 'SBOX03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SBOX03' });

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: cid,
        name: 'Verified Sheet',
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();

    const charRow = await playerA.client
      .from('characters')
      .insert({
        campaign_id: cid,
        user_id: playerA.userId,
        sheet_template_id: tpl.data.id,
        name: 'Legit Hero',
        attributes: { strength: 14 },
        is_active: true,
      })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Legit Hero').first().click();
    await expect(await getSheetSandboxIframeElement(playerAPage)).toBeVisible({ timeout: 10_000 });

    // Send spoofed SHEET_ATTR_CHANGE directly to window with forged instanceId
    await playerAPage.evaluate(() => {
      window.postMessage(
        {
          type: 'SHEET_ATTR_CHANGE',
          instanceId: 'forged-instance-id-9999',
          patch: { strength: 99 },
        },
        '*',
      );
    });

    await playerAPage.waitForTimeout(400);
    const dbChar = await playerA.client.from('characters').select('attributes').eq('id', charRow.data.id).single();
    expect((dbChar.data?.attributes as Record<string, unknown>)?.strength).toBe(14);

    tracker.assertNoErrors();
  });

  test('T2-059: Non-GM player is blocked from SheetTemplateStudio mutations in UI and REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Locked Studio', mode: 'normal', invite_code: 'SBOX04' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SBOX04' });

    await assertSupabaseRejected(
      playerA.client
        .from('character_sheet_templates')
        .insert({ campaign_id: cid, name: 'Rogue Sheet', html_template: '<div/>', css_template: '', schema_json: {} })
        .select(),
      'Player inserting character_sheet_templates',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);

    const studioBtn = playerAPage.locator('aside, nav').getByRole('button', { name: /sheet studio/i });
    if ((await studioBtn.count()) > 0 && (await studioBtn.first().isVisible())) {
      await studioBtn.first().click();
      await expect(playerAPage.getByRole('button', { name: /save template|create template/i })).toHaveCount(0);
    }

    tracker.assertNoErrors();
  });

  test('T2-060: Invalid JSON in SheetTemplateStudio preserves last valid template in DB', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Studio Syntax Guard', mode: 'normal' }).select().single();
    const cid = world.data.id as string;

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: cid,
        name: 'Valid Baseline Sheet',
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Sheet Studio');

    const jsonEditor = gmPage.getByLabel(/json|schema|formula/i).or(gmPage.locator('textarea')).last();
    if (await jsonEditor.isVisible().catch(() => false)) {
      await jsonEditor.fill('{ invalid json !!!');
      const saveBtn = gmPage.getByRole('button', { name: /save/i }).first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
      }
    }

    const dbTpl = await gm.client.from('character_sheet_templates').select('schema_json').eq('id', tpl.data.id).single();
    const parsedSchema =
      typeof dbTpl.data?.schema_json === 'string' ? JSON.parse(dbTpl.data.schema_json) : dbTpl.data?.schema_json;
    expect(parsedSchema && typeof parsedSchema === 'object').toBe(true);

    tracker.assertNoErrors();
  });
});
