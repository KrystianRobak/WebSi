import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  startSupabaseProtocolServer,
  type SupabaseProtocolServer,
} from '../harness/supabaseProtocolServer.js';
import { startAppServer, type AppServerHandle } from '../harness/appServer.js';

export interface ProtocolRuntime {
  server: SupabaseProtocolServer | null;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  isLive: boolean;
}

export interface AssertNoErrorsOptions {
  allowConsoleErrorPatterns?: RegExp[];
}

export interface PageErrorTracker {
  pageErrors: Error[];
  consoleErrors: string[];
  assertNoErrors: (options?: AssertNoErrorsOptions) => void;
}

export async function abortExternalFontRequests(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//i, async (route) => {
    await route.abort('blockedbyclient');
  });
}

export function attachPageErrorTracker(page: Page): PageErrorTracker {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  return {
    pageErrors,
    consoleErrors,
    assertNoErrors: (options?: AssertNoErrorsOptions) => {
      expect(
        pageErrors.map((e) => e.message),
        `Unexpected uncaught page errors: ${pageErrors.map((e) => e.message).join('; ')}`,
      ).toEqual([]);

      const allowed = options?.allowConsoleErrorPatterns ?? [];
      const unexpectedConsoleErrors = consoleErrors.filter(
        (msg) =>
          !allowed.some((pattern) => {
            pattern.lastIndex = 0;
            return pattern.test(msg);
          }),
      );
      expect(
        unexpectedConsoleErrors,
        `Unexpected console errors: ${unexpectedConsoleErrors.join('; ')}`,
      ).toEqual([]);
    },
  };
}

export async function createIsolatedContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await abortExternalFontRequests(ctx);
  return ctx;
}

export interface E2EWorkerFixtures {
  protocolRuntime: ProtocolRuntime;
  appServer: AppServerHandle;
}

export interface E2ETestFixtures {
  resetProtocolState: void;
  gmContext: BrowserContext;
  playerAContext: BrowserContext;
  playerBContext: BrowserContext;
  gmPage: Page;
  playerAPage: Page;
  playerBPage: Page;
}

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  protocolRuntime: [
    async ({}, use) => {
      const liveUrl = process.env.E2E_LIVE_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL;
      const liveAnonKey = process.env.E2E_LIVE_SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY;
      const liveServiceKey = process.env.E2E_LIVE_SUPABASE_SERVICE_ROLE_KEY ?? '';

      if (liveUrl && liveAnonKey) {
        await use({
          server: null,
          url: liveUrl.replace(/\/+$/, ''),
          anonKey: liveAnonKey,
          serviceRoleKey: liveServiceKey,
          isLive: true,
        });
        return;
      }

      const { server, info } = await startSupabaseProtocolServer(0);
      try {
        await use({
          server,
          url: info.url,
          anonKey: info.anonKey,
          serviceRoleKey: info.serviceRoleKey,
          isLive: false,
        });
      } finally {
        await server.stop();
      }
    },
    { scope: 'worker' },
  ],

  appServer: [
    async ({ protocolRuntime }, use) => {
      const handle = await startAppServer({
        supabaseUrl: protocolRuntime.url,
        supabaseAnonKey: protocolRuntime.anonKey,
        mode: process.env.E2E_VITE_MODE === 'preview' ? 'preview' : 'dev',
        buildBeforePreview: process.env.E2E_VITE_MODE === 'preview',
      });
      try {
        await use(handle);
      } finally {
        await handle.stop();
      }
    },
    { scope: 'worker' },
  ],

  resetProtocolState: [
    async ({ protocolRuntime }, use) => {
      if (protocolRuntime.server) {
        protocolRuntime.server.reset();
      }
      await use();
    },
    { auto: true },
  ],

  gmContext: async ({ browser }, use) => {
    const context = await createIsolatedContext(browser);
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  playerAContext: async ({ browser }, use) => {
    const context = await createIsolatedContext(browser);
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  playerBContext: async ({ browser }, use) => {
    const context = await createIsolatedContext(browser);
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  gmPage: async ({ gmContext }, use) => {
    const page = await gmContext.newPage();
    await use(page);
  },

  playerAPage: async ({ playerAContext }, use) => {
    const page = await playerAContext.newPage();
    await use(page);
  },

  playerBPage: async ({ playerBContext }, use) => {
    const page = await playerBContext.newPage();
    await use(page);
  },
});

export { expect };
