import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { XSS_AND_CSS_PAYLOADS } from '../../fixtures/sampleData.js';
import { assertSupabaseRejected, createAuthenticatedUser } from '../../helpers/protocolAdmin.js';
import { openProfileCampaignHub, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-02 Negative & Boundary: Player Profile & Campaign Hub', () => {
  test('T2-006: Blank display name and javascript: avatar URL rejected or sanitized', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const userA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, userA.email, userA.password);
    await openProfileCampaignHub(playerAPage);

    const nameInput = playerAPage.getByLabel(/display name/i).or(playerAPage.getByPlaceholder(/display name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill('   ');

    const avatarInput = playerAPage.getByLabel(/avatar/i).or(playerAPage.getByPlaceholder(/avatar/i)).first();
    if (await avatarInput.isVisible().catch(() => false)) {
      await avatarInput.fill('javascript:alert(1)');
    }

    const saveBtn = playerAPage.getByRole('button', { name: /save profile|update profile|save/i }).first();
    await saveBtn.click();

    // Verify DB profile did not accept blank display_name or javascript: avatar_url
    const profRes = await userA.client.from('profiles').select('*').eq('id', userA.userId).single();
    expect(profRes.error).toBeNull();
    expect(String(profRes.data.display_name ?? '').trim().length).toBeGreaterThan(0);
    expect(String(profRes.data.avatar_url ?? '')).not.toMatch(/^javascript:/i);

    tracker.assertNoErrors();
  });

  test('T2-007: <script> and onerror= payloads in profile bio are neutralized', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const userA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, userA.email, userA.password);
    await openProfileCampaignHub(playerAPage);

    const bioInput = playerAPage.getByLabel(/bio/i).or(playerAPage.getByPlaceholder(/bio/i)).first();
    if (await bioInput.isVisible().catch(() => false)) {
      await bioInput.fill(`${XSS_AND_CSS_PAYLOADS.scriptTag}\n${XSS_AND_CSS_PAYLOADS.imgOnError}`);
      await playerAPage.getByRole('button', { name: /save profile|update profile|save/i }).first().click();
      await playerAPage.reload();
      await openProfileCampaignHub(playerAPage);
    }

    const xssTriggered = await playerAPage.evaluate(
      () => Boolean((window as unknown as { __e2eXssTriggered?: boolean }).__e2eXssTriggered),
    );
    expect(xssTriggered).toBe(false);

    const dangerousScripts = await playerAPage.locator('main script, [role="dialog"] script').count();
    expect(dangerousScripts).toBe(0);

    tracker.assertNoErrors();
  });

  test('T2-008: Extremely long bio and display name clamp cleanly without breaking layout', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const userA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, userA.email, userA.password);
    await openProfileCampaignHub(playerAPage);

    const longText = 'AethelgardChronicleHero_'.repeat(30);
    const nameInput = playerAPage.getByLabel(/display name/i).or(playerAPage.getByPlaceholder(/display name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill(longText);

    const bioInput = playerAPage.getByLabel(/bio/i).or(playerAPage.getByPlaceholder(/bio/i)).first();
    if (await bioInput.isVisible().catch(() => false)) {
      await bioInput.fill(longText.repeat(3));
    }

    const saveBtn = playerAPage.getByRole('button', { name: /save profile|update profile|save/i }).first();
    await saveBtn.click();

    // Ensure viewport does not suffer horizontal blowout blocking Save/Join buttons
    const overflow = await playerAPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 4);
    await expect(saveBtn).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T2-009: Player A cannot edit Player B profiles row via UI or REST', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const userA = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);
    const userB = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    // REST RLS boundary check: Player A cannot modify Player B's profile
    await assertSupabaseRejected(
      userA.client
        .from('profiles')
        .update({ display_name: 'HackedByPlayerA' })
        .eq('id', userB.userId)
        .select(),
      'Player A updating Player B profile',
    );

    const checkB = await userB.client.from('profiles').select('display_name').eq('id', userB.userId).single();
    expect(checkB.data?.display_name).toBe(userB.displayName);

    // UI check: Player A sees only their own profile in Hub
    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, userA.email, userA.password);
    await openProfileCampaignHub(playerAPage);

    const nameInput = playerAPage.getByLabel(/display name/i).or(playerAPage.getByPlaceholder(/display name/i)).first();
    await expect(nameInput).toHaveValue(userA.displayName);

    tracker.assertNoErrors();
  });

  test('T2-010: Empty-campaigns Hub state displays safe onboarding prompt without errors', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const freshUser = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, freshUser.email, freshUser.password);

    // Expect empty-campaigns guidance and Create/Join actions
    await expect(
      playerAPage.getByRole('button', { name: /create campaign|new campaign/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      playerAPage.getByRole('button', { name: /join/i }).first(),
    ).toBeVisible();

    tracker.assertNoErrors();
  });
});
