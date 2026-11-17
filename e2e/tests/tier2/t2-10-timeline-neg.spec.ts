import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { assertSupabaseRejected, provisionTestTrio } from '../../helpers/protocolAdmin.js';
import { openTimelinePane, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-10 Negative & Boundary: Campaign Timeline & Custom Fantasy Calendar', () => {
  test('T2-046: is_gm_only timeline event hidden from Player A in UI and REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Timeline Secrets', mode: 'normal', invite_code: 'TIME01' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'TIME01' });

    await gm.client.from('timeline_events').insert([
      {
        campaign_id: cid,
        title: 'Public Coronation',
        era: 'First Age',
        date_label: 'Year 100, Month 1 Day 1',
        sort_order: 1,
        is_gm_only: false,
      },
      {
        campaign_id: cid,
        title: 'GM Secret Betrayal',
        era: 'First Age',
        date_label: 'Year 100, Month 1 Day 2',
        sort_order: 2,
        is_gm_only: true,
      },
    ]);

    const playerEvents = await playerA.client.from('timeline_events').select('*').eq('campaign_id', cid);
    expect(playerEvents.data).toHaveLength(1);
    expect(playerEvents.data?.[0].title).toBe('Public Coronation');

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openTimelinePane(playerAPage);

    await expect(playerAPage.getByText('Public Coronation').first()).toBeVisible({ timeout: 10_000 });
    await expect(playerAPage.getByText('GM Secret Betrayal')).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-047: Non-GM player cannot create/edit/delete timeline events or calendar config', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client
      .from('worlds')
      .insert({ name: 'Locked Calendar', mode: 'normal', invite_code: 'TIME02' })
      .select()
      .single();
    const cid = world.data.id as string;
    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'TIME02' });

    await assertSupabaseRejected(
      playerA.client.from('timeline_events').insert({ campaign_id: cid, title: 'Player Forged Event', date_label: 'Year 1', sort_order: 1 }).select(),
      'Player inserting timeline_events',
    );
    await assertSupabaseRejected(
      playerA.client.from('worlds').update({ calendar_config: { eraName: 'Hacked Era' } }).eq('id', cid).select(),
      'Player updating calendar_config',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await openTimelinePane(playerAPage);

    await expect(playerAPage.getByRole('button', { name: /add event|new event|create event/i })).toHaveCount(0);
    tracker.assertNoErrors();
  });

  test('T2-048: Zero-month or negative calendar configuration handled/clamped safely', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client
      .from('worlds')
      .insert({
        name: 'Edge Calendar',
        mode: 'normal',
        calendar_config: {
          era: 'Edge Era',
          months: [],
          weekdays: [],
          currentYear: -5,
          currentMonth: -1,
          currentDay: 0,
        },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openTimelinePane(gmPage);

    await expect(gmPage.getByText(/timeline|calendar/i).first()).toBeVisible({ timeout: 10_000 });
    tracker.assertNoErrors();
  });

  test('T2-049: Backward date stepper past Day 1 wraps cleanly without Day 0 or Day -1', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client
      .from('worlds')
      .insert({
        name: 'Wrap Calendar',
        mode: 'normal',
        calendar_config: {
          era: 'Dawn',
          months: ['Frostfall', 'Suncrest'],
          weekdays: ['Moonday', 'Tideday'],
          currentYear: 1000,
          currentMonth: 1,
          currentDay: 1,
        },
      })
      .select()
      .single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openTimelinePane(gmPage);

    const prevDayBtn = gmPage.getByRole('button', { name: /prev(ious)? day|-1 day|step back/i }).first();
    if (await prevDayBtn.isVisible().catch(() => false)) {
      await prevDayBtn.click();
      await expect(gmPage.getByText(/\bDay 0\b|\bDay -1\b/i)).toHaveCount(0);
    }

    tracker.assertNoErrors();
  });

  test('T2-050: Timeline event referencing a deleted linked entity renders without crash', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const world = await gm.client.from('worlds').insert({ name: 'Orphan Event World', mode: 'normal' }).select().single();
    const cid = world.data.id as string;

    const ent = await gm.client
      .from('entities')
      .insert({ world_id: cid, slug: 'doomed-hero', title: 'Doomed Hero', type: 'NPC' })
      .select()
      .single();
    await gm.client.from('timeline_events').insert({
      campaign_id: cid,
      title: 'Fall of Doomed Hero',
      linked_entity_id: ent.data.id,
      date_label: 'Year 500, Month 1 Day 12',
      sort_order: 1,
      is_gm_only: false,
    });
    await gm.client.from('entities').delete().eq('id', ent.data.id);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await openTimelinePane(gmPage);

    await expect(gmPage.getByText('Fall of Doomed Hero').first()).toBeVisible({ timeout: 10_000 });
    tracker.assertNoErrors();
  });
});
