import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { openTimelinePane, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-10: Campaign Timeline & Custom Fantasy Calendar', () => {
  test('T1-046: GM configures custom Fantasy Calendar (era, months, weekdays) and persists to worlds', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('calgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Calendar Keep', mode: 'normal', invite_code: 'CAL01' })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    await openTimelinePane(gmPage);
    await gmPage.getByRole('button', { name: /configure era|calendar/i }).first().click();

    await gmPage.getByLabel(/era name/i).first().fill('Age of Starlight');
    await gmPage.getByLabel(/current year/i).first().fill('1099');
    await gmPage.getByRole('button', { name: /save calendar|save/i }).last().click();

    await expect
      .poll(async () => {
        const res = await gm.client.from('worlds').select('calendar_config').eq('id', world.data.id).single();
        return (res.data?.calendar_config as Record<string, unknown> | null)?.eraName;
      })
      .toBe('Age of Starlight');

    tracker.assertNoErrors();
  });

  test('T1-047: GM advances campaign date via Fantasy Calendar date stepper', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('stepgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({
        name: 'Stepper Realm',
        mode: 'normal',
        invite_code: 'STEP1',
        calendar_config: {
          eraName: 'First Age',
          months: [
            { name: 'Frostfall', days: 30 },
            { name: 'Suncrest', days: 30 },
          ],
          weekdays: ['Moonday', 'Tideday'],
          currentYear: 100,
          currentMonthIndex: 0,
          currentDay: 1,
        },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openTimelinePane(gmPage);

    await gmPage.getByRole('button', { name: /\+1 day|next day|step day/i }).first().click();

    await expect
      .poll(async () => {
        const res = await gm.client.from('worlds').select('calendar_config').eq('id', world.data.id).single();
        return (res.data?.calendar_config as Record<string, unknown> | null)?.currentDay;
      })
      .toBe(2);

    tracker.assertNoErrors();
  });

  test('T1-048: GM creates chronological timeline_events rendered in date order', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('evgm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Chronicle Order', mode: 'normal', invite_code: 'ORD01' })
      .select()
      .single();

    expect((await gm.client.from('timeline_events').insert([
      { campaign_id: world.data.id, title: 'Later Siege', date_label: 'Year 1050, Suncrest 10', sort_order: 20, is_gm_only: false },
      { campaign_id: world.data.id, title: 'Earlier Treaty', date_label: 'Year 1040, Frostfall 5', sort_order: 10, is_gm_only: false },
    ])).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openTimelinePane(gmPage);

    await expect(gmPage.getByText('Earlier Treaty').first()).toBeVisible();
    await expect(gmPage.getByText('Later Siege').first()).toBeVisible();

    const bodyText = (await gmPage.locator('main, [role="tabpanel"]').first().textContent()) ?? '';
    expect(bodyText.indexOf('Earlier Treaty')).toBeLessThan(bodyText.indexOf('Later Siege'));

    tracker.assertNoErrors();
  });

  test('T1-049: timeline aggregates Chronicle/Event/Session/History entities and navigates on click', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const gmCreds = makeUserCredentials('agg_gm');
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, gmCreds);
    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Aggregated History', mode: 'normal', invite_code: 'AGG01' })
      .select()
      .single();

    const ent = await gm.client
      .from('entities')
      .insert({
        world_id: world.data.id,
        slug: 'session-12-sunken-vault',
        title: 'Session 12: Sunken Vault',
        type: 'Session',
        content: '<p>Recovered the astrolabe.</p>',
        metadata: { is_gm_only: false },
      })
      .select()
      .single();
    expect(ent.error).toBeNull();

    expect((await gm.client.from('timeline_events').insert({
      campaign_id: world.data.id,
      linked_entity_id: ent.data.id,
      title: 'Vault Discovery',
      date_label: 'Year 1045, Frostfall 3',
      sort_order: 1,
      is_gm_only: false,
    })).error).toBeNull();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gmCreds.email, gmCreds.password);
    await openTimelinePane(gmPage);

    await gmPage.getByText('Session 12: Sunken Vault').first().click();
    await expect(gmPage.getByText('Recovered the astrolabe.').first()).toBeVisible({ timeout: 10_000 });

    tracker.assertNoErrors();
  });

  test('T1-050: players see public timeline events and never see is_gm_only events', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const pCreds = makeUserCredentials('calplayer');
    const player = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, pCreds);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Public History', mode: 'normal', invite_code: 'HIST1' })
      .select()
      .single();
    await player.client.rpc('join_campaign_by_invite', { p_invite_code: 'HIST1' });

    expect((await gm.client.from('timeline_events').insert([
      { campaign_id: world.data.id, title: 'Festival of Lanterns', date_label: 'Year 1000, Frostfall 1', sort_order: 1, is_gm_only: false },
      { campaign_id: world.data.id, title: 'Secret Demon Pact', date_label: 'Year 1001, Frostfall 2', sort_order: 2, is_gm_only: true },
    ])).error).toBeNull();

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, pCreds.email, pCreds.password);
    await openTimelinePane(playerAPage);

    await expect(playerAPage.getByText('Festival of Lanterns').first()).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText('Secret Demon Pact')).not.toBeVisible();

    tracker.assertNoErrors();
  });
});
