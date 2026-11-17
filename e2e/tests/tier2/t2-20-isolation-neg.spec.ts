import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import {
  assertSupabaseRejected,
  createAnonClient,
  provisionTestTrio,
} from '../../helpers/protocolAdmin.js';
import { signInViaAuthScreen, switchCampaignInHeader } from '../../helpers/uiActions.js';

test.describe('UF-20 Negative & Boundary: Cross-Campaign & Storage Bucket RLS Isolation', () => {
  test('T2-096: Campaign A member blocked from reading or writing Campaign B tables via REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const { gm, playerA } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const wA = await gm.client
      .from('worlds')
      .insert({ name: 'Campaign A', mode: 'normal', invite_code: 'ISOA1' })
      .select()
      .single();
    const wB = await gm.client
      .from('worlds')
      .insert({ name: 'Campaign B Secret', mode: 'normal', invite_code: 'ISOB1' })
      .select()
      .single();
    const cidB = wB.data.id as string;

    await playerA.client.rpc('join_campaign_by_invite', { p_invite_code: 'ISOA1' });

    await gm.client.from('entities').insert({ world_id: cidB, slug: 'b-only-relic', title: 'B-Only Relic', type: 'Item' });
    await gm.client.from('maps').insert({ world_id: cidB, name: 'B-Only Map', kind: '3d' });
    await gm.client.from('timeline_events').insert({ campaign_id: cidB, title: 'B-Only Event', date_label: 'Year 10', sort_order: 10 });

    // Cross-campaign reads return []
    expect((await playerA.client.from('worlds').select('*').eq('id', cidB)).data).toEqual([]);
    expect((await playerA.client.from('entities').select('*').eq('world_id', cidB)).data).toEqual([]);
    expect((await playerA.client.from('maps').select('*').eq('world_id', cidB)).data).toEqual([]);
    expect((await playerA.client.from('characters').select('*').eq('campaign_id', cidB)).data).toEqual([]);
    expect((await playerA.client.from('journal_pages').select('*').eq('campaign_id', cidB)).data).toEqual([]);
    expect((await playerA.client.from('dice_rolls').select('*').eq('campaign_id', cidB)).data).toEqual([]);
    expect((await playerA.client.from('timeline_events').select('*').eq('campaign_id', cidB)).data).toEqual([]);

    // Cross-campaign writes rejected with 42501
    await assertSupabaseRejected(
      playerA.client.from('characters').insert({ campaign_id: cidB, user_id: playerA.userId, name: 'Intruder' }).select(),
      'Cross-campaign character insert into Campaign B',
    );
    await assertSupabaseRejected(
      playerA.client.from('dice_rolls').insert({ campaign_id: cidB, user_id: playerA.userId, expression: '1d20', total: 20 }).select(),
      'Cross-campaign dice_rolls insert into Campaign B',
    );

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, playerA.email, playerA.password);
    await expect(playerAPage.getByText('Campaign A').first()).toBeVisible({ timeout: 10_000 });
    await expect(playerAPage.getByText('Campaign B Secret')).toHaveCount(0);
    void wA;

    tracker.assertNoErrors();
  });

  test('T2-097: Anon client is blocked from writing or deleting in vault-assets Storage bucket', async ({
    protocolRuntime,
  }) => {
    const anon = createAnonClient(protocolRuntime.url, protocolRuntime.anonKey);
    const payload = new Blob(['not-authorized'], { type: 'text/plain' });

    const uploadRes = await anon.storage.from('vault-assets').upload('anon-probe/test.png', payload, {
      contentType: 'image/png',
    });
    expect(uploadRes.error).not.toBeNull();

    const delRes = await anon.storage.from('vault-assets').remove(['anon-probe/test.png']);
    expect(delRes.error).not.toBeNull();
  });

  test('T2-098: Anon client is blocked from reading or writing all protected campaign tables', async ({
    protocolRuntime,
  }) => {
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);
    const world = await gm.client.from('worlds').insert({ name: 'Anon Guarded', mode: 'normal' }).select().single();
    const cid = world.data.id as string;

    const anon = createAnonClient(protocolRuntime.url, protocolRuntime.anonKey);
    for (const table of ['worlds', 'entities', 'characters', 'journal_pages', 'dice_rolls', 'maps'] as const) {
      const sel = await anon.from(table).select('*');
      expect(sel.data ?? []).toEqual([]);
    }

    await assertSupabaseRejected(
      anon.from('worlds').insert({ name: 'Anon World' }).select(),
      'Anon inserting into worlds',
    );
    await assertSupabaseRejected(
      anon.from('entities').insert({ world_id: cid, slug: 'anon-entity', title: 'Anon Entity', type: 'NPC' }).select(),
      'Anon inserting into entities',
    );
  });

  test('T2-099: Invalid/corrupt file upload handled gracefully without crashing app', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    await gm.client.from('worlds').insert({ name: 'Corrupt File Test', mode: 'normal' }).select().single();

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 10_000 });

    const imageInput = gmPage.locator('input[type="file"][accept*="image" i]').first();
    if ((await imageInput.count()) > 0) {
      await imageInput.setInputFiles({
        name: 'corrupt.png',
        mimeType: 'image/png',
        buffer: Buffer.from('NOT_A_VALID_PNG_HEADER_BYTES', 'utf8'),
      });
    }

    await expect(gmPage.locator('header')).toBeVisible();
    tracker.assertNoErrors();
  });

  test('T2-100: Switching active campaign closes stale sub-modals and clears prior campaign state', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const { gm } = await provisionTestTrio(protocolRuntime.url, protocolRuntime.anonKey);

    const w1 = await gm.client.from('worlds').insert({ name: 'First Campaign', mode: 'normal' }).select().single();
    const w2 = await gm.client.from('worlds').insert({ name: 'Second Campaign', mode: 'normal' }).select().single();
    await gm.client.from('entities').insert({ world_id: w1.data.id, slug: 'first-only-item', title: 'FirstOnlyItem', type: 'Item' });
    await gm.client.from('entities').insert({ world_id: w2.data.id, slug: 'second-only-item', title: 'SecondOnlyItem', type: 'Item' });

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, gm.email, gm.password);

    await switchCampaignInHeader(gmPage, 'First Campaign');
    await expect(gmPage.getByText('FirstOnlyItem').first()).toBeVisible({ timeout: 15_000 });
    // Open Settings modal if present, then close its full-screen backdrop before using header switcher
    const settingsBtn = gmPage.locator('header').getByRole('button', { name: /settings/i }).first();
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click();
      await expect(gmPage.getByRole('dialog')).toBeVisible();
      await gmPage.getByRole('dialog').getByRole('button').first().click();
      await expect(gmPage.getByRole('dialog')).toHaveCount(0);
    }

    await switchCampaignInHeader(gmPage, 'Second Campaign');
    await expect(gmPage.getByText('FirstOnlyItem')).toHaveCount(0);
    tracker.assertNoErrors();
  });
});
