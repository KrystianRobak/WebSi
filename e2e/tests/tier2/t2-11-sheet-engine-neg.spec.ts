import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  getSheetSandboxIframe,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

async function setupSheetAndCharacter(
  protocolRuntime: { url: string; anonKey: string },
  overrides: { schemaJson: string; html?: string; css?: string; attributes?: Record<string, unknown> },
) {
  const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
  const world = await gm.client
    .from('worlds')
    .insert({ name: 'Sheet Engine Edge', mode: 'normal', invite_code: 'SHTE01' })
    .select()
    .single();
  const cid = world.data.id as string;
  await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SHTE01' });

  const tpl = await gm.client
    .from('character_sheet_templates')
    .insert({
      campaign_id: cid,
      name: 'Edge Formula Sheet',
      html_template: overrides.html ?? ROLL20_CUSTOM_SHEET_SAMPLE.html,
      css_template: overrides.css ?? ROLL20_CUSTOM_SHEET_SAMPLE.css,
      schema_json: JSON.parse(overrides.schemaJson),
    })
    .select()
    .single();

  await gm.client.from('worlds').update({ active_sheet_template_id: tpl.data.id }).eq('id', cid);

  const char = await playerA.client
    .from('characters')
    .insert({
      campaign_id: cid,
      user_id: playerA.userId,
      sheet_template_id: tpl.data.id,
      name: 'Formula Tester',
      attributes: overrides.attributes ?? { strength: 16, proficiency: 2 },
      is_active: true,
    })
    .select()
    .single();

  return { gm, playerA, cid, tplId: tpl.data.id as string, charId: char.data.id as string };
}

test.describe('UF-11 Negative & Boundary: Roll20 Sheet Presets & Safe Expression Engine', () => {
  test('T2-051: JS/eval injection in formula fails safely without executing arbitrary code', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { playerA } = await setupSheetAndCharacter(protocolRuntime, {
      schemaJson: JSON.stringify({
        defaults: { strength: 12 },
        computed: {
          str_mod: '((() => { window.__e2eXssTriggered = true; return 99; })())',
          attack_bonus: 'Function("window.__e2eXssTriggered=true; return 77")()',
        },
      }),
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Formula Tester').first().click();

    const frame = await getSheetSandboxIframe(playerAPage);
    await expect(frame.locator('input[name="attr_str_mod"]')).toBeVisible({ timeout: 10_000 });
    const val = await frame.locator('input[name="attr_str_mod"]').inputValue();
    expect(val).not.toBe('99');

    const parentXss = await playerAPage.evaluate(
      () => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered),
    );
    expect(parentXss).toBe(false);
    tracker.assertNoErrors();
  });

  test('T2-052: Circular formula dependency (a=@{b}+1, b=@{a}+1) terminates safely', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { playerA } = await setupSheetAndCharacter(protocolRuntime, {
      schemaJson: JSON.stringify({
        defaults: { strength: 10 },
        computed: {
          str_mod: '@{attack_bonus} + 1',
          attack_bonus: '@{str_mod} + 1',
        },
      }),
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Formula Tester').first().click();

    const frame = await getSheetSandboxIframe(playerAPage);
    await expect(frame.locator('input[name="attr_str_mod"]')).toBeVisible({ timeout: 10_000 });
    const strModVal = await frame.locator('input[name="attr_str_mod"]').inputValue();
    expect(strModVal).not.toBe('NaN');
    expect(strModVal).not.toBe('Infinity');

    tracker.assertNoErrors();
  });

  test('T2-053: Division by zero and missing @{nonexistent} resolve to safe fallback', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { playerA } = await setupSheetAndCharacter(protocolRuntime, {
      schemaJson: JSON.stringify({
        defaults: { strength: 10 },
        computed: {
          str_mod: '@{strength} / 0',
          attack_bonus: '@{nonexistent_attr} + 2',
        },
      }),
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Formula Tester').first().click();

    const frame = await getSheetSandboxIframe(playerAPage);
    await expect(frame.locator('input[name="attr_str_mod"]')).toBeVisible({ timeout: 10_000 });
    const modVal = await frame.locator('input[name="attr_str_mod"]').inputValue();
    const atkVal = await frame.locator('input[name="attr_attack_bonus"]').inputValue();

    expect(modVal).not.toContain('Infinity');
    expect(modVal).not.toContain('NaN');
    expect(atkVal).not.toContain('NaN');

    tracker.assertNoErrors();
  });

  test('T2-054: Malformed [[1d]] roll macro inside sheet shows safe error without crashing Dice Log', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { playerA, cid } = await setupSheetAndCharacter(protocolRuntime, {
      html: `<div class="sheet-root">
        <button type="button" data-roll="[[1d]]" data-roll-label="Broken Roll">Broken [[1d]]</button>
      </div>`,
      schemaJson: JSON.stringify({ defaults: {}, computed: {} }),
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Formula Tester').first().click();

    const frame = await getSheetSandboxIframe(playerAPage);
    await frame.locator('button[data-roll]').first().click();

    await playerAPage.waitForTimeout(300);
    const rolls = await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cid);
    expect(rolls.data).toEqual([]);
    await expect(playerAPage.locator('header')).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T2-055: Non-numeric input in numeric attribute avoids NaN cascade across computed outputs', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { playerA } = await setupSheetAndCharacter(protocolRuntime, {
      schemaJson: ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Formula Tester').first().click();

    const frame = await getSheetSandboxIframe(playerAPage);
    const strInput = frame.locator('input[name="attr_strength"]');
    await expect(strInput).toBeVisible({ timeout: 10_000 });
    await strInput.evaluate((el: HTMLInputElement) => {
      el.type = 'text';
      el.value = 'not-a-number';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const strMod = await frame.locator('input[name="attr_str_mod"]').inputValue();
    const atkBonus = await frame.locator('input[name="attr_attack_bonus"]').inputValue();
    expect(strMod).not.toBe('NaN');
    expect(atkBonus).not.toBe('NaN');

    tracker.assertNoErrors();
  });
});
