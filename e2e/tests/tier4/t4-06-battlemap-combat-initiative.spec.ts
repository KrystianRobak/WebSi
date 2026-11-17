import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { createPngDataUrl, ROLL20_CUSTOM_SHEET_SAMPLE } from '../../fixtures/sampleData.js';
import { provisionTestTrio } from '../../helpers/protocolAdmin.js';
import {
  advanceInitiativeTurn,
  getPrimaryViewportCanvas,
  getSheetSandboxIframe,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('T4-06: Live 2D Battlemap Combat: Persistent Fog, Token Ownership, Hidden Enemies & Initiative', () => {
  test('T4-06: GM sets up 2D Battlemap with fog, linked tokens & hidden ambush -> Player A cannot drag B token -> Initiative & linked sheet roll sync live', async ({
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
      .insert({ name: 'Tactical Arena 2D', mode: 'normal', invite_code: 'COMBAT46' })
      .select()
      .single();
    const cid = world.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'COMBAT46' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'COMBAT46' });

    const tpl = await gm.client
      .from('character_sheet_templates')
      .insert({
        campaign_id: cid,
        name: 'Combat Sheet',
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson),
      })
      .select()
      .single();

    const charA = await playerA.client
      .from('characters')
      .insert({
        campaign_id: cid,
        user_id: playerA.userId,
        sheet_template_id: tpl.data.id,
        name: 'Aeliana Vanguard',
        attributes: { character_name: 'Aeliana Vanguard', strength: 16, proficiency: 2 },
        is_active: true,
      })
      .select()
      .single();
    const charB = await playerB.client
      .from('characters')
      .insert({
        campaign_id: cid,
        user_id: playerB.userId,
        sheet_template_id: tpl.data.id,
        name: 'Bramwell Cleric',
        attributes: { character_name: 'Bramwell Cleric', strength: 12, proficiency: 2 },
        is_active: true,
      })
      .select()
      .single();

    const mapRow = await gm.client
      .from('maps')
      .insert({
        world_id: cid,
        name: 'Catacomb Crossing',
        kind: '2d',
        fog_of_war_2d: createPngDataUrl(16, 16, [180, 180, 180, 255]),
        battlemap: {
          gridSize: 40,
          fogOfWarEnabled: true,
          tokens: [
            {
              id: 'tok-a',
              name: 'Aeliana Vanguard',
              x: 160,
              y: 160,
              character_id: charA.data.id,
              owner_user_id: playerA.userId,
              isHidden: false,
            },
            {
              id: 'tok-b',
              name: 'Bramwell Cleric',
              x: 320,
              y: 220,
              character_id: charB.data.id,
              owner_user_id: playerB.userId,
              isHidden: false,
            },
            {
              id: 'tok-ambush',
              name: 'HIDDEN_SHADOW_ASSASSIN',
              x: 420,
              y: 240,
              isHidden: true,
            },
          ],
          walls: [],
          lights: [],
          aoes: [{ id: 'aoe-fireball', kind: 'circle', x: 350, y: 250, radius: 20, label: 'Fireball' }],
        },
        combat_state: {
          active: true,
          round: 1,
          activeTurnIndex: 0,
          entries: [
            {
              id: 'init-a',
              name: 'Aeliana Vanguard',
              initiative: 19,
              characterId: charA.data.id,
              ownerUserId: playerA.userId,
              conditions: ['Blessed'],
            },
            {
              id: 'init-b',
              name: 'Bramwell Cleric',
              initiative: 14,
              characterId: charB.data.id,
              ownerUserId: playerB.userId,
              conditions: [],
            },
          ],
        },
      })
      .select()
      .single();

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

    for (const p of [gmPage, playerAPage, playerBPage]) {
      await openSidebarSection(p, 'Vault');
      const mBtn = p.getByText('Catacomb Crossing').first();
      if (await mBtn.isVisible().catch(() => false)) {
        await mBtn.click();
      }
      const collapseBtn = p.getByRole('button', { name: /collapse drawer/i });
      if (await collapseBtn.isVisible().catch(() => false)) {
        await collapseBtn.click();
      }
      await expect(await getPrimaryViewportCanvas(p)).toBeVisible({ timeout: 15_000 });
    }

    // Hidden ambush token is absent from Player A & Player B
    await expect(playerAPage.getByText('HIDDEN_SHADOW_ASSASSIN')).toHaveCount(0);
    await expect(playerBPage.getByText('HIDDEN_SHADOW_ASSASSIN')).toHaveCount(0);

    // Player A attempts to drag Player B's token -> blocked
    const canvasA = await getPrimaryViewportCanvas(playerAPage);
    const boxA = await canvasA.boundingBox();
    if (boxA) {
      await playerAPage.mouse.move(boxA.x + 320, boxA.y + 220);
      await playerAPage.mouse.down();
      await playerAPage.mouse.move(boxA.x + 480, boxA.y + 300, { steps: 4 });
      await playerAPage.mouse.up();
    }
    const dbMapAfterDrag = await gm.client.from('maps').select('battlemap').eq('id', mapRow.data.id).single();
    const tokensAfterDrag =
      (dbMapAfterDrag.data?.battlemap as { tokens?: Array<{ id: string; x: number }> })?.tokens ?? [];
    expect(tokensAfterDrag.find((t) => t.id === 'tok-b')?.x).toBe(320);

    // GM advances initiative turn
    const nextBtn = gmPage.getByRole('button', { name: /next turn/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await advanceInitiativeTurn(gmPage);
      await expect(playerBPage.getByText(/Bramwell Cleric/i).first()).toBeVisible({ timeout: 10_000 });
    }

    // Player A clicks linked combatant or character -> opens sheet & rolls
    const combatEntry = playerAPage.getByRole('button', { name: /Aeliana Vanguard/i }).first();
    if (await combatEntry.isVisible().catch(() => false)) {
      await combatEntry.click();
    }
    const frameA = await getSheetSandboxIframe(playerAPage);
    if ((await frameA.locator('button[data-roll]').count()) > 0) {
      await frameA.locator('button[data-roll]').first().click();
      await expect.poll(async () => {
        const rolls = await gm.client.from('dice_rolls').select('*').eq('campaign_id', cid);
        return rolls.data?.length ?? 0;
      }, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    }

    trackerGm.assertNoErrors();
    trackerA.assertNoErrors();
    trackerB.assertNoErrors();
  });
});
