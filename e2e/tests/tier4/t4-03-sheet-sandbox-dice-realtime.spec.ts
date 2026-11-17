import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  getSheetSandboxIframe,
  openSidebarSection,
  rollDiceInDrawer,
  signInViaAuthScreen,
  toggleDiceDrawer,
} from '../../helpers/uiActions.js';

test.describe('T4-03: Roll20 Sheet Studio -> Sandboxed Iframe Hydration -> Realtime Dice Log', () => {
  test('T4-03: GM authors Roll20 template -> Players hydrate & update attributes/repeating rows -> [[roll]] syncs live while GM blind roll stays hidden', async ({
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
      .insert({ name: 'Roll20 Live Hall', mode: 'normal', invite_code: 'SHEET43' })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'SHEET43' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'SHEET43' });

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: cid,
        name: ROLL20_CUSTOM_SHEET_SAMPLE.name,
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();
    await gm.client.from('worlds').update({ active_sheet_template_id: tpl.data.id }).eq('id', cid);

    const charA = await playerA.client
      .from('characters')
      .insert({
        campaign_id: cid,
        user_id: playerA.userId,
        sheet_template_id: tpl.data.id,
        name: 'Ser Rowan',
        attributes: { character_name: 'Ser Rowan', strength: 16, proficiency: 2 },
        is_active: true,
      })
      .select()
      .single();

    await playerB.client.from('characters').insert({
      campaign_id: cid,
      user_id: playerB.userId,
      sheet_template_id: tpl.data.id,
      name: 'Mirabel Sage',
      attributes: { character_name: 'Mirabel Sage', strength: 10, proficiency: 2 },
      is_active: true,
    });

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

    // GM verifies Sheet Studio opens cleanly
    await openSidebarSection(gmPage, 'Sheet Studio');
    await expect(gmPage.getByText(ROLL20_CUSTOM_SHEET_SAMPLE.name).first()).toBeVisible({ timeout: 10_000 });

    // Player A opens character sheet inside sandboxed iframe & updates strength 16 -> 18 (+4 mod, +6 attack)
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Ser Rowan').first().click();

    const frameA = await getSheetSandboxIframe(playerAPage);
    const strInput = frameA.locator('input[name="attr_strength"]');
    await expect(strInput).toBeVisible({ timeout: 10_000 });
    await strInput.fill('18');
    await strInput.dispatchEvent('change');

    // Open Dice Drawer on Player B & GM to observe Realtime roll broadcast
    await toggleDiceDrawer(gmPage);
    await toggleDiceDrawer(playerBPage);

    // Player A triggers [[1d20+@{attack_bonus}]] roll button from inside iframe
    await frameA.locator('button[data-roll]').first().click();

    // Wait for dice_rolls row to persist & broadcast live to GM and Player B
    await expect.poll(async () => {
      const res = await gm.client.from('dice_rolls').select('*').eq('campaign_id', cid);
      return res.data?.length ?? 0;
    }, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

    await expect(playerBPage.getByText(/Longsword Strike|Ser Rowan|1d20/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.getByText(/Longsword Strike|Ser Rowan|1d20/i).first()).toBeVisible({ timeout: 10_000 });

    // GM executes a blind GM roll -> visible to GM only, hidden from Player A & Player B
    await rollDiceInDrawer(gmPage, '1d20+10', { blindGm: true });
    await expect.poll(async () => {
      const res = await gm.client.from('dice_rolls').select('*').eq('campaign_id', cid).eq('is_gm_blind', true);
      return res.data?.length ?? 0;
    }, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

    const playerASeesBlind = await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cid).eq('is_gm_blind', true);
    expect(playerASeesBlind.data).toEqual([]);

    // Verify Player A strength persisted across reload
    await playerAPage.reload();
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Ser Rowan').first().click();
    const dbChar = await playerA.client.from('characters').select('attributes').eq('id', charA.data.id).single();
    expect(Number((dbChar.data?.attributes as Record<string, unknown>)?.strength)).toBe(18);

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
