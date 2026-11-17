import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { createCharacterInPane, openSidebarSection, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-13 Negative & Boundary: Characters, West Marches 1-Char Rule & Token Linking', () => {
  test('T2-061: West Marches 2nd active character rejected in UI and via assertSupabaseRejected', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'WM Strict Roster', mode: 'west_marches', invite_code: 'WMCH01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMCH01' });

    await playerA.client.from('characters').insert({
      campaign_id: cid,
      user_id: playerA.userId,
      name: 'First Active Hero',
      is_active: true,
    });

    const err = await assertSupabaseRejected(
      playerA.client
        .from('characters')
        .insert({
          campaign_id: cid,
          user_id: playerA.userId,
          name: 'Illegal Second Active',
          is_active: true,
        })
        .select(),
      '2nd active character in West Marches',
    );
    expect(err.code).toBe('23505');

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');

    const newCharBtn = playerAPage.getByRole('button', { name: /new character|create character/i }).first();
    if ((await newCharBtn.isVisible().catch(() => false)) && !(await newCharBtn.isDisabled())) {
      await createCharacterInPane(playerAPage, 'Second Active Attempt');
    }

    const activeChars = await playerA.client
      .from('characters')
      .select('*')
      .eq('campaign_id', cid)
      .eq('user_id', playerA.userId)
      .eq('is_active', true);
    expect(activeChars.data).toHaveLength(1);

    tracker.assertNoErrors();
  });

  test('T2-062: Player A cannot edit or delete Player B character via UI or REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA, playerB } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Char Ownership', mode: 'normal', invite_code: 'WMCH02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMCH02' });
    await playerB.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMCH02' });

    const charB = await playerB.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerB.userId, name: 'Player B Paladin', is_active: true })
      .select()
      .single();

    await assertSupabaseRejected(
      playerA.client.from('characters').update({ name: 'Stolen' }).eq('id', charB.data.id).select(),
      'Player A updating Player B character',
    );
    await assertSupabaseRejected(
      playerA.client.from('characters').delete().eq('id', charB.data.id).select(),
      'Player A deleting Player B character',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await expect(playerAPage.getByRole('button', { name: /delete.*Player B Paladin/i })).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-063: Empty character name is rejected cleanly', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Char Name Validation', mode: 'normal', invite_code: 'WMCH03' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMCH03' });

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await createCharacterInPane(playerAPage, '   ');

    const chars = await playerA.client.from('characters').select('*').eq('campaign_id', cid);
    expect(chars.data).toEqual([]);
    tracker.assertNoErrors();
  });

  test('T2-064: Deleting a token-linked character handles battlemap token gracefully', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Orphan Token Char', mode: 'normal', invite_code: 'WMCH04' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMCH04' });

    const charA = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Fallen Rogue', is_active: true })
      .select()
      .single();

    await gm.client.from('maps').insert({
      world_id: cid,
      name: 'Dungeon Arena',
      kind: '2d',
      battlemap: {
        tokens: [
          {
            id: 'tok-orphan',
            label: 'Fallen Rogue',
            x: 100,
            y: 100,
            character_id: charA.data.id,
            owner_user_id: playerA.userId,
          },
        ],
        walls: [],
        lights: [],
      },
    });

    // Delete linked character before GM opens battlemap
    await playerA.client.from('characters').delete().eq('id', charA.data.id);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openSidebarSection(gmPage, 'Vault');
    const mapBtn = gmPage.getByText('Dungeon Arena').first();
    if (await mapBtn.isVisible().catch(() => false)) {
      await mapBtn.click();
    }

    await expect(gmPage.locator('header')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-065: Normal -> West Marches mode switch enforces single active character constraint', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Mode Switch World', mode: 'normal', invite_code: 'WMCH05' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'WMCH05' });

    const c1 = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Hero Alpha', is_active: true })
      .select()
      .single();
    const c2 = await playerA.client
      .from('characters')
      .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Hero Beta', is_active: true })
      .select()
      .single();
    expect(c1.error).toBeNull();
    expect(c2.error).toBeNull();

    // Switching to west_marches while Player A has 2 active chars is rejected by DB trigger (23505)
    const switchErr = await assertSupabaseRejected(
      gm.client.from('worlds').update({ mode: 'west_marches' }).eq('id', cid).select(),
      'Switch to West Marches with 2 active characters',
    );
    expect(switchErr.code).toBe('23505');

    // Bench Hero Beta, then switch to west_marches succeeds and blocks adding a 2nd active character
    await playerA.client.from('characters').update({ is_active: false }).eq('id', c2.data.id);
    const switchOk = await gm.client.from('worlds').update({ mode: 'west_marches' }).eq('id', cid).select().single();
    expect(switchOk.error).toBeNull();

    await assertSupabaseRejected(
      playerA.client
        .from('characters')
        .insert({ campaign_id: cid, user_id: playerA.userId, name: 'Hero Gamma', is_active: true })
        .select(),
      '2nd active character after Normal->West Marches switch',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openSidebarSection(playerAPage, 'Characters');
    await expect(playerAPage.getByText('Hero Alpha').first()).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });
});
