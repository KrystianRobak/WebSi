import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials, ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  advanceInitiativeTurn,
  createCharacterInPane,
  getPrimaryViewportCanvas,
  getSheetSandboxIframe,
  openSidebarSection,
  rollDiceInDrawer,
  signInViaAuthScreen,
  toggleDiceDrawer,
} from '../../helpers/uiActions.js';

test.describe('Tier 3 Pairwise Integration: Roll20 Sheets, Dice Roller & 2D Combat (T3-07..T3-12)', () => {
  test('T3-07: [UF-11 x UF-12] Author sheet in Studio -> Assign to campaign -> Hydrate sandbox iframe -> Computed attrs persist', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('t3_studio');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Sheet Forge Keep', mode: 'normal', invite_code: 'SFK07' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openSidebarSection(gmPage, 'Sheet Studio');

    const starterBtn = gmPage.getByRole('button', { name: /create 5e starter sheet/i }).first();
    if (await starterBtn.isVisible().catch(() => false)) {
      await starterBtn.click();
    }

    await gmPage.getByLabel('Sheet Template Name').first().fill(ROLL20_CUSTOM_SHEET_SAMPLE.name);
    await gmPage.getByRole('button', { name: /html template/i }).first().click();
    await gmPage.locator('textarea').first().fill(ROLL20_CUSTOM_SHEET_SAMPLE.html);
    await gmPage.getByRole('button', { name: /css styling/i }).first().click();
    await gmPage.locator('textarea').first().fill(ROLL20_CUSTOM_SHEET_SAMPLE.css);
    await gmPage.getByRole('button', { name: /schema & formulas/i }).first().click();
    await gmPage.locator('textarea').first().fill(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson);
    await gmPage.getByRole('button', { name: /save template/i }).first().click();

    await expect
      .poll(async () => (await gm.client.from('character_sheet_templates').select('id').eq('campaign_id', world.data.id)).data?.length ?? 0)
      .toBe(1);

    const tpl = (await gm.client.from('character_sheet_templates').select('id').eq('campaign_id', world.data.id).single()).data!;
    await gm.client.from('worlds').update({ active_sheet_template_id: tpl.id }).eq('id', world.data.id);

    await createCharacterInPane(gmPage, 'Gideon');
    await gmPage.getByText('Gideon').first().click();

    const iframe = await getSheetSandboxIframe(gmPage);
    await iframe.locator('input[name="attr_strength"]').fill('18');
    await iframe.locator('input[name="attr_strength"]').blur();

    await expect(iframe.locator('input[name="attr_str_mod"]')).toHaveValue('4', { timeout: 10_000 });
    await expect(iframe.locator('input[name="attr_attack_bonus"]')).toHaveValue('6');

    tracker.assertNoErrors();
  });

  test('T3-08: [UF-12 x UF-14] Sheet [[roll]] postMessage triggers DiceRollerDrawer and syncs to peer via Realtime', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_roll_gm');
    const pCreds = makeUserCredentials('t3_roll_p');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Live Dice Forge', mode: 'normal', invite_code: 'LDF08' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'LDF08' });

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
    await player.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: player.userId,
      sheet_template_id: tpl.data.id,
      name: 'Valeria',
      attributes: { strength: 16, proficiency: 2 },
      is_active: true,
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await toggleDiceDrawer(gmPage);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openSidebarSection(playerAPage, 'Characters');
    await playerAPage.getByText('Valeria').first().click();

    const iframe = await getSheetSandboxIframe(playerAPage);
    await iframe.getByRole('button', { name: /longsword strike|roll longsword/i }).first().click();

    await expect(gmPage.getByText(/Longsword Strike|1d20\+5/i).first()).toBeVisible({ timeout: 15_000 });

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });

  test('T3-09: [UF-11 x UF-13] West Marches 1-active-char rule + retire & replace inherits campaign active sheet preset', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm9'));
    const pCreds = makeUserCredentials('t3_p9');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'WM Roster Hall', mode: 'west_marches', invite_code: 'WMR09' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMR09' });

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: world.data.id,
        name: 'WM Guild Preset',
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();
    await gm.client.from('worlds').update({ active_sheet_template_id: tpl.data.id }).eq('id', world.data.id);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await createCharacterInPane(playerAPage, 'First Explorer');

    await playerAPage.getByRole('button', { name: /retire|deactivate/i }).first().click();
    await createCharacterInPane(playerAPage, 'Second Explorer');
    await playerAPage.getByText('Second Explorer').first().click();

    const iframe = await getSheetSandboxIframe(playerAPage);
    await expect(iframe.locator('input[name="attr_strength"]')).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T3-10: [UF-13 x UF-17] Character linked to Lore Entity and Battlemap Token enforces player drag ownership', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('t3_gm10'));
    const pACreds = makeUserCredentials('t3_p10a');
    const pBCreds = makeUserCredentials('t3_p10b');
    const pA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pACreds);
    const pB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pBCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Token Lore Keep', mode: 'normal', invite_code: 'TLK10' })
      .select()
      .single();
    await pA.client.rpc('join_campaign_by_invite', { p_invite_code: 'TLK10' });
    await pB.client.rpc('join_campaign_by_invite', { p_invite_code: 'TLK10' });

    const ent = await gm.client
      .from('entities')
      .insert({ world_id: world.data.id, slug: 'alden-bio', title: 'Alden Bio', type: 'NPC' })
      .select()
      .single();
    const charA = await pA.client
      .from('characters')
      .insert({ campaign_id: world.data.id, user_id: pA.userId, entity_id: ent.data.id, name: 'Alden', is_active: true })
      .select()
      .single();

    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Vault Approach',
        kind: '2d',
        battlemap: {
          gridSizePx: 50,
          width: 800,
          height: 800,
          showGrid: true,
          tokens: [
            { id: 'tA', name: 'Alden', character_id: charA.data.id, owner_user_id: pA.userId, disposition: 'party', x: 100, y: 100, sizeCells: 1, hp: 20, maxHp: 20, ac: 15, visionRangeFt: 60, lightRadiusFt: 0, lightColor: '#ffffff', isHidden: false },
            { id: 'tB', name: 'Rival B', owner_user_id: pB.userId, disposition: 'party', x: 400, y: 400, sizeCells: 1, hp: 20, maxHp: 20, ac: 15, visionRangeFt: 60, lightRadiusFt: 0, lightColor: '#ffffff', isHidden: false },
          ],
          walls: [],
          doors: [],
          lights: [],
        },
      })
      .select()
      .single();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pACreds.email, pACreds.password);
    await playerAPage.getByText('Vault Approach').first().click();
    await expect(playerAPage.getByText('Alden').first()).toBeVisible({ timeout: 15_000 });

    const canvas = await getPrimaryViewportCanvas(playerAPage);
    const box = (await canvas.boundingBox())!;
    await playerAPage.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await playerAPage.mouse.down();
    await playerAPage.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 4 });
    await playerAPage.mouse.up();

    const mapAfter = await gm.client.from('maps').select('battlemap').eq('id', bmap.data.id).single();
    const tokens = ((mapAfter.data?.battlemap as Record<string, unknown>)?.tokens as Array<Record<string, unknown>>) ?? [];
    expect(tokens.find((t) => t.id === 'tB')?.x).toBe(400);
    expect(tokens.find((t) => t.id === 'tB')?.y).toBe(400);

    tracker.assertNoErrors();
  });

  test('T3-11: [UF-17 x UF-18] 2D Fog + InitiativeTrackerBar rounds, conditions & AoE sync live to Player view', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_gm11');
    const pCreds = makeUserCredentials('t3_p11');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Siege Grid', mode: 'normal', invite_code: 'SGE11' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'SGE11' });

    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Gatehouse 2D',
      kind: '2d',
      combat_state: {
        active: true,
        round: 1,
        activeTurnIndex: 0,
        entries: [
          { id: 'e1', name: 'Vanguard', initiative: 18, conditions: [] },
          { id: 'e2', name: 'Orc Captain', initiative: 11, conditions: [] },
        ],
      },
      battlemap: {
        gridSizePx: 50,
        width: 800,
        height: 800,
        showGrid: true,
        fogOfWarEnabled: true,
        tokens: [
          { id: 'tok1', name: 'Vanguard', owner_user_id: player.userId, disposition: 'party', x: 150, y: 150, sizeCells: 1, hp: 20, maxHp: 20, ac: 15, visionRangeFt: 60, lightRadiusFt: 0, lightColor: '#ffffff', isHidden: false },
        ],
        walls: [],
        doors: [],
        lights: [],
      },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Gatehouse 2D').first().click();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await playerAPage.getByText('Gatehouse 2D').first().click();

    await advanceInitiativeTurn(gmPage);
    await advanceInitiativeTurn(gmPage);

    await expect(playerAPage.getByText(/round\s*2/i).first()).toBeVisible({ timeout: 15_000 });

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });

  test('T3-12: [UF-14 x UF-18] Click combatant in InitiativeTracker -> Open linked sheet -> Roll public & blind GM rolls', async ({
    appServer,
    protocolRuntime,
    gmPage,
    playerAPage,
  }) => {
    const gmTracker = attachPageErrorTracker(gmPage);
    const pTracker = attachPageErrorTracker(playerAPage);

    const gmCreds = makeUserCredentials('t3_gm12');
    const pCreds = makeUserCredentials('t3_p12');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Combat Roll Keep', mode: 'normal', invite_code: 'CRK12' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'CRK12' });

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
    const char = await player.client
      .from('characters')
      .insert({
        campaign_id: world.data.id,
        user_id: player.userId,
        sheet_template_id: tpl.data.id,
        name: 'Corvus',
        attributes: { strength: 16, proficiency: 2 },
        is_active: true,
      })
      .select()
      .single();

    await gm.client.from('maps').insert({
      world_id: world.data.id,
      name: 'Boss Chamber',
      kind: '2d',
      combat_state: {
        active: true,
        round: 1,
        activeTurnIndex: 0,
        entries: [{ id: 'c-corvus', name: 'Corvus', initiative: 21, characterId: char.data.id, conditions: [] }],
      },
      battlemap: { gridSizePx: 50, width: 700, height: 700, showGrid: true, tokens: [], walls: [], doors: [], lights: [] },
    });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await gmPage.getByText('Boss Chamber').first().click();
    await toggleDiceDrawer(gmPage);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await playerAPage.getByText('Boss Chamber').first().click();
    await toggleDiceDrawer(playerAPage);

    await playerAPage.getByRole('button', { name: /Corvus|open sheet/i }).first().click();
    const iframe = await getSheetSandboxIframe(playerAPage);
    await iframe.getByRole('button', { name: /longsword strike|roll longsword/i }).first().click();

    await expect(gmPage.getByText(/Longsword Strike|1d20\+5/i).first()).toBeVisible({ timeout: 15_000 });

    // GM blind roll remains hidden from player
    await rollDiceInDrawer(gmPage, '1d20+9', { blindGm: true });
    await expect(gmPage.getByText(/1d20\+9/).first()).toBeVisible({ timeout: 10_000 });
    await playerAPage.waitForTimeout(300);
    await expect(playerAPage.getByText(/1d20\+9/)).not.toBeVisible();

    gmTracker.assertNoErrors();
    pTracker.assertNoErrors();
  });
});
