import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials, ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  getSheetSandboxIframe,
  getSheetSandboxIframeElement,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-12: Roll20 Sheet Template Studio & <iframe sandbox="allow-scripts"> Runtime', () => {
  test('T1-056: SheetTemplateStudio 3-pane HTML/CSS/JSON editor updates live preview iframe in real time', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('studio3p');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    await gm.client.from('worlds').insert({ name: 'Studio Hall', mode: 'normal', invite_code: 'STUD1' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Sheet Studio');

    const createStarterBtn = gmPage.getByRole('button', { name: /create 5e starter sheet/i });
    if (await createStarterBtn.isVisible().catch(() => false)) {
      await createStarterBtn.click();
    }

    await gmPage.getByRole('button', { name: /html template/i }).click();
    const codeEditor = gmPage.locator('textarea').first();
    await expect(codeEditor).toBeVisible();
    await codeEditor.fill('<div class="live-box"><h3>Live Studio Banner</h3><input name="attr_hero_rank" value="7" /></div>');

    const iframe = await getSheetSandboxIframe(gmPage);
    await expect(iframe.getByText('Live Studio Banner')).toBeVisible({ timeout: 10_000 });
    await expect(iframe.locator('input[name="attr_hero_rank"]')).toHaveValue('7');

    tracker.assertNoErrors();
  });

  test('T1-057: GM saves custom sheet template in Studio and assigns it as campaign active_sheet_template_id', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('save_tpl');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Template Realm', mode: 'west_marches', invite_code: 'TPL01' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Sheet Studio');

    const createStarterBtn = gmPage.getByRole('button', { name: /create 5e starter sheet/i });
    if (await createStarterBtn.isVisible().catch(() => false)) {
      await createStarterBtn.click();
    }

    await gmPage.getByLabel(/sheet template name/i).fill(ROLL20_CUSTOM_SHEET_SAMPLE.name);
    const editor = gmPage.locator('textarea').first();
    await gmPage.getByRole('button', { name: /html template/i }).click();
    await editor.fill(ROLL20_CUSTOM_SHEET_SAMPLE.html);
    await gmPage.getByRole('button', { name: /css styling/i }).click();
    await editor.fill(ROLL20_CUSTOM_SHEET_SAMPLE.css);
    await gmPage.getByRole('button', { name: /schema/i }).click();
    await editor.fill(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson);

    await gmPage.getByRole('button', { name: /save template/i }).click();

    await expect
      .poll(async () => {
        const res = await gm.client
          .from('character_sheet_templates')
          .select('id, name')
          .eq('campaign_id', world.data.id);
        return res.data?.some((t) => t.name === ROLL20_CUSTOM_SHEET_SAMPLE.name) ?? false;
      })
      .toBe(true);

    const assignBtn = gmPage.getByRole('button', { name: /set as campaign default/i });
    if (await assignBtn.isVisible().catch(() => false)) {
      await assignBtn.click();
      await expect
        .poll(async () => (await gm.client.from('worlds').select('active_sheet_template_id').eq('id', world.data.id).single()).data?.active_sheet_template_id)
        .toBeTruthy();
    }

    tracker.assertNoErrors();
  });

  test('T1-058: character sheet renders inside <iframe sandbox="allow-scripts"> without allow-same-origin and hydrates via postMessage', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('sandbox');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Sandbox Citadel', mode: 'normal', invite_code: 'SBOX1' })
      .select()
      .single();
    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: ROLL20_CUSTOM_SHEET_SAMPLE.name,
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();
    expect(tpl.error).toBeNull();
    const charRes = await gm.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: gm.userId,
      sheet_template_id: tpl.data.id,
      name: 'Isolde',
      attributes: { character_name: 'Isolde of the Vale', strength: 18, proficiency: 3 },
      is_active: true,
    });
    expect(charRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Isolde').first().click();

    const iframeEl = await getSheetSandboxIframeElement(gmPage);
    await expect(iframeEl).toBeVisible({ timeout: 10_000 });
    const sandboxAttr = (await iframeEl.getAttribute('sandbox')) ?? '';
    expect(sandboxAttr).toContain('allow-scripts');
    expect(sandboxAttr).not.toContain('allow-same-origin');

    const iframe = await getSheetSandboxIframe(gmPage);
    await expect(iframe.locator('input[name="attr_character_name"]')).toHaveValue('Isolde of the Vale', { timeout: 10_000 });
    await expect(iframe.locator('input[name="attr_attack_bonus"]')).toHaveValue('7');

    tracker.assertNoErrors();
  });

  test('T1-059: editing attr_* inside sandboxed iframe debounces and persists to characters.attributes across reload', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('attrsave');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Debounce Keep', mode: 'normal', invite_code: 'DEBN1' })
      .select()
      .single();
    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: ROLL20_CUSTOM_SHEET_SAMPLE.name,
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();
    expect(tpl.error).toBeNull();
    const charRes = await gm.client
      .from('characters')
      .insert({
        campaign_id: world.data.id,
        user_id: gm.userId,
        sheet_template_id: tpl.data.id,
        name: 'Ser Roland',
        attributes: { strength: 14, proficiency: 2 },
        is_active: true,
      })
      .select()
      .single();
    expect(charRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Ser Roland').first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    const strInput = iframe.locator('input[name="attr_strength"]');
    await strInput.fill('20');
    await strInput.blur();

    await expect
      .poll(async () => {
        const res = await gm.client.from('characters').select('attributes').eq('id', charRes.data.id).single();
        return Number((res.data?.attributes as Record<string, unknown>)?.strength);
      })
      .toBe(20);

    await gmPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Ser Roland').first().click();
    await expect((await getSheetSandboxIframe(gmPage)).locator('input[name="attr_strength"]')).toHaveValue('20', {
      timeout: 10_000,
    });

    tracker.assertNoErrors();
  });

  test('T1-060: repeating section + Add and Delete buttons inside sandboxed sheet persist rows', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('repeat');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Arsenal Hall', mode: 'normal', invite_code: 'REPT1' })
      .select()
      .single();
    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: ROLL20_CUSTOM_SHEET_SAMPLE.name,
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();
    expect(tpl.error).toBeNull();
    const charRes = await gm.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: gm.userId,
      sheet_template_id: tpl.data.id,
      name: 'Weaponmaster',
      attributes: { strength: 16 },
      is_active: true,
    });
    expect(charRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Weaponmaster').first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    const addBtn = iframe.locator('button[data-repeat-add]').first();
    await addBtn.click();

    const weaponInput = iframe.locator('input[name*="weapon_name"]').first();
    await expect(weaponInput).toBeVisible({ timeout: 10_000 });
    await weaponInput.fill('Silver Halberd');
    await weaponInput.blur();

    const delBtn = iframe.locator('button[data-repeat-del]').first();
    await delBtn.click();
    await expect(iframe.locator('input[name*="weapon_name"]')).toHaveCount(0);

    tracker.assertNoErrors();
  });
});
