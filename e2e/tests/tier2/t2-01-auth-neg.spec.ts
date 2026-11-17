import { test, expect, attachPageErrorTracker } from '../../fixtures/e2eFixtures.js';
import { makeUserCredentials } from '../../fixtures/sampleData.js';
import { createAuthenticatedUser, createAnonClient } from '../../helpers/protocolAdmin.js';
import { signUpViaAuthScreen, signInViaAuthScreen } from '../../helpers/uiActions.js';

test.describe('UF-01 Negative & Boundary: Web-Only Auth, Session Persistence & Invite Flow', () => {
  test('T2-001: Malformed email or short password (<6 chars) rejected cleanly on Sign Up', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    await gmPage.goto(appServer.url);

    // Attempt malformed email
    await signUpViaAuthScreen(gmPage, {
      email: 'not-an-email',
      password: 'ValidPass123!',
      displayName: 'Bad Email User',
    });

    // Should remain on AuthScreen (header workspace shell should not appear)
    await expect(gmPage.locator('header').getByRole('button', { name: /dice|roller/i })).toHaveCount(0);

    // Attempt short password (<6 chars)
    const validCreds = makeUserCredentials('shortpw');
    await signUpViaAuthScreen(gmPage, {
      email: validCreds.email,
      password: '123',
      displayName: validCreds.displayName,
    });

    await expect(gmPage.locator('header').getByRole('button', { name: /dice|roller/i })).toHaveCount(0);
    const authControlVisible = await gmPage
      .getByRole('button', { name: /sign up|sign in|create account/i })
      .first()
      .isVisible();
    expect(authControlVisible).toBe(true);

    // Verify no user/profile was created in backend
    const anon = createAnonClient(protocolRuntime.url, protocolRuntime.anonKey);
    const signInAttempt = await anon.auth.signInWithPassword({
      email: validCreds.email,
      password: '123',
    });
    expect(signInAttempt.error).not.toBeNull();
    expect(signInAttempt.data.session).toBeNull();

    tracker.assertNoErrors();
  });

  test('T2-002: Wrong credentials show error feedback and block workspace access', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const user = await createAuthenticatedUser(protocolRuntime.url, protocolRuntime.anonKey);

    await gmPage.goto(appServer.url);
    await signInViaAuthScreen(gmPage, user.email, 'DefinitelyWrongPassword999!');

    // Wait for error alert/text or ensure workspace shell does not mount
    await expect(
      gmPage.getByText(/invalid|incorrect|error|failed|credentials/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(gmPage.locator('header').getByRole('button', { name: /dice|roller/i })).toHaveCount(0);

    // Verify no Supabase auth token was stored for session
    const hasSessionToken = await gmPage.evaluate(() => {
      return Object.keys(window.localStorage).some(
        (k) => k.includes('auth-token') && (window.localStorage.getItem(k) ?? '').includes('access_token'),
      );
    });
    expect(hasSessionToken).toBe(false);

    tracker.assertNoErrors({
      allowConsoleErrorPatterns: [/Failed to load resource:.*400/i],
    });
  });

  test('T2-003: Invalid ?invite=CODE query param handled gracefully across auth without crash', async ({
    playerAPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(playerAPage);
    const playerCreds = makeUserCredentials('badinvite');

    await playerAPage.goto(`${appServer.url}/?invite=INVALID999`);
    await signUpViaAuthScreen(playerAPage, playerCreds);

    // Workspace or Profile Hub should mount without crashing
    await expect(
      playerAPage.getByText(/invalid|not found|invite|create campaign|profile/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify zero accidental campaign memberships via REST
    const client = createAnonClient(protocolRuntime.url, protocolRuntime.anonKey);
    const login = await client.auth.signInWithPassword({
      email: playerCreds.email,
      password: playerCreds.password,
    });
    expect(login.error).toBeNull();
    const memberships = await client.from('campaign_members').select('*');
    expect(memberships.error).toBeNull();
    expect(memberships.data).toEqual([]);

    tracker.assertNoErrors();
  });

  test('T2-004: Legacy localStorage vault keys and x-vault-token cannot bypass AuthScreen', async ({
    gmPage,
    appServer,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);

    await gmPage.addInitScript(() => {
      window.localStorage.setItem('aethelgard_vault_unlocked', 'true');
      window.localStorage.setItem('aethelgard_vault_token', 'forged-legacy-token');
      window.localStorage.setItem('vault_offline_cache', JSON.stringify({ worlds: [{ id: 'fake', name: 'Fake' }] }));
      window.localStorage.setItem('x-vault-token', 'legacy-bypass');
    });

    await gmPage.goto(appServer.url);

    // AuthScreen must remain enforced
    await expect(
      gmPage.getByLabel(/email/i).or(gmPage.getByPlaceholder(/email/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      gmPage.getByRole('button', { name: /sign in|log in/i }).first(),
    ).toBeVisible();
    await expect(gmPage.getByText('Fake')).toHaveCount(0);

    tracker.assertNoErrors();
  });

  test('T2-005: Revoked or expired JWT token forces AuthScreen re-authentication', async ({
    gmPage,
    appServer,
    protocolRuntime,
  }) => {
    const tracker = attachPageErrorTracker(gmPage);
    const creds = makeUserCredentials('revoked');

    await gmPage.goto(appServer.url);
    await signUpViaAuthScreen(gmPage, creds);

    // Wait for authenticated shell or Hub
    await expect(
      gmPage.locator('header').or(gmPage.getByRole('button', { name: /create campaign|new campaign/i })).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Extract access token and revoke via server logout endpoint
    const storedAuth = await gmPage.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        const val = window.localStorage.getItem(k);
        if (val && val.includes('access_token')) {
          return { key: k, raw: val };
        }
      }
      return null;
    });

    if (storedAuth) {
      const parsed = JSON.parse(storedAuth.raw) as { access_token?: string };
      if (parsed.access_token) {
        await fetch(`${protocolRuntime.url}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: protocolRuntime.anonKey,
            Authorization: `Bearer ${parsed.access_token}`,
          },
        });
      }
    }

    // Corrupt/expire token in localStorage and reload
    await gmPage.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        if (k.includes('auth-token')) {
          window.localStorage.setItem(
            k,
            JSON.stringify({ access_token: 'expired.invalid.jwt', refresh_token: 'invalid-refresh', expires_at: 1 }),
          );
        }
      }
    });

    await gmPage.reload();

    // Must force AuthScreen
    await expect(
      gmPage.getByLabel(/email/i).or(gmPage.getByPlaceholder(/email/i)).first(),
    ).toBeVisible({ timeout: 15_000 });

    tracker.assertNoErrors({
      allowConsoleErrorPatterns: [/Failed to load resource:.*400/i],
    });
  });
});
