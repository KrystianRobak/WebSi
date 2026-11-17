import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import {
  createCharacterInPane,
  openSidebarSection,
  signInViaAuthScreen,
} from '../../helpers/uiActions.js';

test.describe('UF-13: Character Manager, West Marches 1-Active-Char Rule & Token Linking', () => {
  test('T1-061: player creates a new character in CharacterManagerPane and sees it persisted', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('charnew');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Hero Forge', mode: 'normal', invite_code: 'HERO1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'HERO1' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await createCharacterInPane(playerAPage, 'Aurelia Brightshield');
    await expect(playerAPage.getByText('Aurelia Brightshield').first()).toBeVisible({ timeout: 10_000 });

    const chars = await player.client
      .from('characters')
      .select('name, is_active')
      .eq('campaign_id', world.data.id)
      .eq('user_id', player.userId);
    expect(chars.data?.some((c) => c.name === 'Aurelia Brightshield' && c.is_active === true)).toBe(true);

    tracker.assertNoErrors();
  });

  test('T1-062: Normal mode campaign allows a player to hold multiple simultaneous active characters', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('multichar');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Multi Party Saga', mode: 'normal', invite_code: 'MULT1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'MULT1' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);

    await createCharacterInPane(playerAPage, 'Bard One');
    await createCharacterInPane(playerAPage, 'Paladin Two');

    await expect
      .poll(async () => {
        const res = await player.client
          .from('characters')
          .select('id')
          .eq('campaign_id', world.data.id)
          .eq('user_id', player.userId)
          .eq('is_active', true);
        return res.data?.length ?? 0;
      })
      .toBe(2);

    tracker.assertNoErrors();
  });

  test('T1-063: West Marches mode requires retiring active character before activating a replacement character', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('wmchar');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'West Marches Roster', mode: 'west_marches', invite_code: 'WMR01' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMR01' });

    await player.client.from('characters').insert({
      campaign_id: world.data.id,
      user_id: player.userId,
      name: 'Old Scout',
      is_active: true,
    });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openSidebarSection(playerAPage, 'Characters');

    // Retire Old Scout
    await playerAPage.getByRole('button', { name: /retire|deactivate/i }).first().click();

    await expect
      .poll(async () => {
        const res = await player.client
          .from('characters')
          .select('is_active')
          .eq('campaign_id', world.data.id)
          .eq('name', 'Old Scout')
          .single();
        return res.data?.is_active;
      })
      .toBe(false);

    // Now create replacement active character
    await createCharacterInPane(playerAPage, 'New Vanguard');
    await expect
      .poll(async () => {
        const res = await player.client
          .from('characters')
          .select('name, is_active')
          .eq('campaign_id', world.data.id)
          .eq('is_active', true);
        return res.data?.[0]?.name;
      })
      .toBe('New Vanguard');

    tracker.assertNoErrors();
  });

  test('T1-064: character links to a Lore Entity via entity_id and navigates to linked Lore tab', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('linkent');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Lore Linked Realm', mode: 'normal', invite_code: 'LNK01' })
      .select()
      .single();

    const entity = await gm.client
      .from('entities')
      .insert({
        world_id: world.data.id,
        slug: 'lore-bio-kaelen',
        title: 'Lore Bio: Kaelen',
        type: 'Character',
        content: '<p>Born in the Iron Peaks.</p>',
      })
      .select()
      .single();

    const char = await gm.client
      .from('characters')
      .insert({
        campaign_id: world.data.id,
        user_id: gm.userId,
        name: 'Kaelen Sheet',
        is_active: true,
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openSidebarSection(gmPage, 'Characters');
    await gmPage.getByText('Kaelen Sheet').first().click();

    const entitySelect = gmPage.getByLabel(/linked.*entity|lore entity/i).first();
    await entitySelect.selectOption(entity.data.id);

    await expect
      .poll(async () => (await gm.client.from('characters').select('entity_id').eq('id', char.data.id).single()).data?.entity_id)
      .toBe(entity.data.id);

    tracker.assertNoErrors();
  });

  test('T1-065: GM assigns character_id and owner_user_id to a 2D Battlemap token in BattlemapInspectorSection', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('toklink');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('tokowner'));

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Token Link Arena', mode: 'normal', invite_code: 'TOKL1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'TOKL1' });

    const char = await player.client
      .from('characters')
      .insert({
        campaign_id: world.data.id,
        user_id: player.userId,
        name: 'Theron',
        is_active: true,
      })
      .select()
      .single();

    const tokenId = 'tok-link-1';
    const bmap = await gm.client
      .from('maps')
      .insert({
        world_id: world.data.id,
        name: 'Arena Grid',
        kind: '2d',
        battlemap: {
          gridSizePx: 50,
          widthCells: 20,
          heightCells: 20,
          tokens: [
            {
              id: tokenId,
              name: 'Unlinked Fighter',
              x: 3,
              y: 3,
              sizeCells: 1,
              badgeColor: '#38bdf8',
              disposition: 'party',
            },
          ],
          walls: [],
          lights: [],
        },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.getByText('Arena Grid').first()).toBeVisible({ timeout: 15_000 });
    await gmPage.getByText('Arena Grid').first().click();

    await gmPage.getByText('Unlinked Fighter').first().locator('xpath=../..').click();
    const charSelect = gmPage.getByLabel(/linked character/i).first();
    if (!(await charSelect.isVisible().catch(() => false))) {
      await gmPage.getByRole('button', { name: /open inspector drawer|inspector/i }).first().click();
    }
    await expect(charSelect).toBeVisible({ timeout: 10_000 });
    await charSelect.selectOption(char.data.id);

    const ownerSelect = gmPage.getByLabel(/player owner|assigned player/i).first();
    if (await ownerSelect.isVisible().catch(() => false)) {
      await ownerSelect.selectOption(player.userId);
    }

    await expect
      .poll(async () => {
        const res = await gm.client.from('maps').select('battlemap').eq('id', bmap.data.id).single();
        const tokens = ((res.data?.battlemap as Record<string, unknown>)?.tokens as Array<Record<string, unknown>>) ?? [];
        return tokens[0]?.character_id;
      })
      .toBe(char.data.id);

    tracker.assertNoErrors();
  });
});
