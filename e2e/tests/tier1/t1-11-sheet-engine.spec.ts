import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials, ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  getSheetSandboxIframe,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-11: Roll20 Sheet Presets & Safe Expression/Macro Engine', () => {
  test('T1-051: built-in "5e Fantasy Adventurer" sheet preset loads in Sheet Studio and hydrates character sheet', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('preset5e');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    await gm.client.from('worlds').insert({ name: '5e Preset World', mode: 'normal', invite_code: 'DND5E' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openSidebarSection(gmPage, 'Sheet Studio');
    await gmPage.getByRole('button', { name: /5e fantasy adventurer/i }).first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    await expect(iframe.locator('input[name="attr_str"]').first()).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T1-052: built-in "Minimal Narrative" sheet preset renders narrative fields inside sandbox iframe', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('presetmin');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    await gm.client.from('worlds').insert({ name: 'Minimal World', mode: 'normal', invite_code: 'MIN01' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Sheet Studio');

    await gmPage.getByRole('button', { name: /minimal narrative/i }).first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    await expect(iframe.locator('input, textarea').first()).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T1-053: safe sheet engine evaluates floor((@{strength} - 10) / 2) -> str_mod dynamically', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('flooreval');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Formula Keep', mode: 'normal', invite_code: 'FORM1' })
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
      name: 'Formula Knight',
      attributes: { strength: 16, proficiency: 2 },
      is_active: true,
    });
    expect(charRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Formula Knight').first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    await expect(iframe.locator('input[name="attr_str_mod"]')).toHaveValue('3', { timeout: 10_000 });

    // Update strength from 16 -> 19 => floor((19-10)/2) = 4
    await iframe.locator('input[name="attr_strength"]').fill('19');
    await iframe.locator('input[name="attr_strength"]').blur();
    await expect(iframe.locator('input[name="attr_str_mod"]')).toHaveValue('4', { timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T1-054: safe sheet engine evaluates ceil, round, max, min, and abs functions without eval()', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('mathfns');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Math Citadel', mode: 'normal', invite_code: 'MATH1' })
      .select()
      .single();

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: 'Math Functions Sheet',
        html_template: `<div>
          <input type="number" name="attr_raw" value="-7" />
          <input type="number" name="attr_ceil_v" readonly />
          <input type="number" name="attr_round_v" readonly />
          <input type="number" name="attr_max_v" readonly />
          <input type="number" name="attr_min_v" readonly />
          <input type="number" name="attr_abs_v" readonly />
        </div>`,
        css_template: 'div { padding: 8px; }',
        schema_json: {
          defaults: { raw: -7 },
          computed: {
            ceil_v: 'ceil(5 / 2)',
            round_v: 'round(7 / 2)',
            max_v: 'max(3, 9, 5)',
            min_v: 'min(3, 9, 5)',
            abs_v: 'abs(@{raw})',
          },
        },
      })
      .select()
      .single();
    expect(tpl.error).toBeNull();

    const charRes = await gm.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: gm.userId,
      sheet_template_id: tpl.data.id,
      name: 'Arithmancer',
      attributes: { raw: -7 },
      is_active: true,
    });
    expect(charRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Arithmancer').first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    await expect(iframe.locator('input[name="attr_ceil_v"]')).toHaveValue('3', { timeout: 10_000 });
    await expect(iframe.locator('input[name="attr_round_v"]')).toHaveValue('4');
    await expect(iframe.locator('input[name="attr_max_v"]')).toHaveValue('9');
    await expect(iframe.locator('input[name="attr_min_v"]')).toHaveValue('3');
    await expect(iframe.locator('input[name="attr_abs_v"]')).toHaveValue('7');

    tracker.assertNoErrors();
  });

  test('T1-055: roll macro 1d20+@{perception_mod} resolves attribute placeholder when triggered from sheet', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('macro');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Macro Keep', mode: 'normal', invite_code: 'MACR1' })
      .select()
      .single();

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: 'Perception Sheet',
        html_template: `<div>
          <input type="number" name="attr_perception_mod" value="5" />
          <button type="button" data-roll="[[1d20+@{perception_mod}]]" data-label="Perception Check">
            Perception [[1d20+@{perception_mod}]]
          </button>
        </div>`,
        css_template: '',
        schema_json: { defaults: { perception_mod: 5 }, computed: {} },
      })
      .select()
      .single();
    expect(tpl.error).toBeNull();

    const charRes = await gm.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: gm.userId,
      sheet_template_id: tpl.data.id,
      name: 'Eagle Eye',
      attributes: { perception_mod: 5 },
      is_active: true,
    });
    expect(charRes.error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Eagle Eye').first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    const rollInsertPromise = gmPage.waitForResponse(
      (res) => res.url().includes('/rest/v1/dice_rolls') && res.request().method() === 'POST',
    );
    await iframe.getByRole('button', { name: /perception/i }).first().click();
    const rollResp = await rollInsertPromise;
    expect(rollResp.ok()).toBe(true);

    const rolls = await gm.client.from('dice_rolls').select('expression, total').eq('campaign_id', world.data.id);
    expect(rolls.data).toHaveLength(1);
    expect(rolls.data?.[0].expression).toContain('1d20+5');

    tracker.assertNoErrors();
  });
});
