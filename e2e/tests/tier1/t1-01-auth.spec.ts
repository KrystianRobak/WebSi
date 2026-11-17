import { test, expect, attachPageErrorTracker, abortExternalFontRequests } from '../../fixtures/e2eFixtures.js';
import { startMissingEnvAppServer } from '../../harness/appServer.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { signUpViaAuthScreen, signInViaAuthScreen } from '../../helpers/uiActions.js';
import { createAuthenticatedUser } from '../../helpers/protocolAdmin.js';

test.describe('UF-01: Web-Only Auth, Session Persistence & ?invite=CODE Flow', () => {
  test('T1-001: missing .env renders setup guide instead of crashing when Supabase env vars are absent', async ({ browser }) => {
    const missingEnvApp = await startMissingEnvAppServer();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await abortExternalFontRequests(context);
    const page = await context.newPage();
    const tracker = attachPageErrorTracker(page);

    try {
      await page.goto(missingEnvApp.url, { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByText(/VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|supabase.*config|environment/i).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('#root')).not.toBeEmpty();
      tracker.assertNoErrors();
    } finally {
      await context.close();
      await missingEnvApp.stop();
    }
  });

  test('T1-002: email + password signup creates account, triggers public.profiles row, and enters workspace', async ({
    appServer,
    protocolRuntime,
    gmPage,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const creds = makeUserCredentials('signup');

    await gmPage.goto(appServer.url);
    await expect(gmPage.getByRole('button', { name: /sign up|create account|register/i }).first()).toBeVisible();

    const signupResponsePromise = gmPage.waitForResponse(
      (res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST',
    );
    await signUpViaAuthScreen(gmPage, creds);
    const signupResp = await signupResponsePromise;
    expect(signupResp.status()).toBe(200);

    // Verify workspace shell loads after signup
    await expect(gmPage.locator('header')).toBeVisible({ timeout: 15_000 });

    // Verify public.profiles auto-created via protocolAdmin
    const signedIn = await createAuthenticatedUser(
      protocolRuntime.url,
      protocolRuntime.anonKey,
      makeUserCredentials('observer'),
    );
    const profileQuery = await signedIn.client
      .from('profiles')
      .select('id, display_name')
      .eq('display_name', creds.displayName)
      .single();
    expect(profileQuery.error).toBeNull();
    expect(profileQuery.data?.display_name).toBe(creds.displayName);

    tracker.assertNoErrors();
  });

  test('T1-003: existing user signs in via AuthScreen with email + password', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const creds = makeUserCredentials('signin');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, creds);

    await playerAPage.goto(appServer.url);
    const tokenPromise = playerAPage.waitForResponse(
      (res) => res.url().includes('/auth/v1/token') && res.request().method() === 'POST',
    );
    await signInViaAuthScreen(playerAPage, creds.email, creds.password);
    const tokenResp = await tokenPromise;
    expect(tokenResp.status()).toBe(200);

    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByText(new RegExp(creds.displayName, 'i')).first()).toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-004: persistSession keeps user authenticated across full browser reload without AuthScreen', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const creds = makeUserCredentials('persist');
    await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, creds);

    await playerAPage.goto(appServer.url);
    await signInViaAuthScreen(playerAPage, creds.email, creds.password);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    // Verify Supabase auth token persisted in localStorage
    const hasAuthToken = await playerAPage.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
    );
    expect(hasAuthToken).toBe(true);

    await playerAPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(playerAPage.getByRole('button', { name: /^sign in$/i })).not.toBeVisible();

    tracker.assertNoErrors();
  });

  test('T1-005: ?invite=CODE query param is preserved across AuthScreen signup and joins target campaign', async ({
    appServer,
    protocolRuntime,
    playerAPage,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const gm = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey, makeUserCredentials('gm'));
    const worldRes = await gm.client
      .from('worlds')
      .insert({ name: 'Invited Realm', mode: 'west_marches', invite_code: 'INV2026' })
      .select()
      .single();
    expect(worldRes.error).toBeNull();
    const campaignId = worldRes.data.id as string;

    const playerCreds = makeUserCredentials('invited');
    await playerAPage.goto(`${appServer.url}/?invite=INV2026`);
    expect(playerAPage.url()).toContain('invite=INV2026');

    await signUpViaAuthScreen(playerAPage, playerCreds);
    await expect(playerAPage.locator('header')).toBeVisible({ timeout: 15_000 });

    // Verify campaign membership was established via invite code
    await expect
      .poll(async () => {
        const res = await gm.client
          .from('campaign_members')
          .select('user_id, role')
          .eq('campaign_id', campaignId);
        return res.data?.length ?? 0;
      })
      .toBe(2);

    await expect(playerAPage.getByText(/Invited Realm/i).first()).toBeVisible({ timeout: 15_000 });
    tracker.assertNoErrors();
  });
});
