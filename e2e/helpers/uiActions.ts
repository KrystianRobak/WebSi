import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

export interface AuthCredentials {
  email: string;
  password: string;
  displayName?: string;
}

export type SidebarSection =
  | 'Vault'
  | 'Journals'
  | 'Characters'
  | 'Sheet Studio'
  | 'Timeline'
  | 'Assets'
  | 'Templates'
  | 'Profile';

/**
 * AuthScreen opaque-box actions (PROJECT.md § F7)
 */
export async function signUpViaAuthScreen(page: Page, creds: AuthCredentials): Promise<void> {
  const signUpTab = page.getByRole('button', { name: /sign up|create account|register/i }).first();
  if (await signUpTab.isVisible().catch(() => false)) {
    await signUpTab.click();
  }

  if (creds.displayName) {
    const displayNameInput = page
      .getByLabel(/display name|name/i)
      .or(page.getByPlaceholder(/display name|name/i))
      .first();
    if (await displayNameInput.isVisible().catch(() => false)) {
      await displayNameInput.fill(creds.displayName);
    }
  }

  await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).first().fill(creds.email);
  await page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).first().fill(creds.password);

  await page.getByRole('button', { name: /sign up|create account|register/i }).last().click();
}

export async function signInViaAuthScreen(page: Page, email: string, password: string): Promise<void> {
  const signInTab = page.getByRole('button', { name: /sign in|log in/i }).first();
  if (await signInTab.isVisible().catch(() => false)) {
    await signInTab.click();
  }

  await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).first().fill(email);
  await page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).first().fill(password);

  await page.getByRole('button', { name: /sign in|log in/i }).last().click();
}

export async function requestPasswordReset(page: Page, email: string): Promise<void> {
  const forgotBtn = page.getByRole('button', { name: /forgot|reset password/i }).first();
  await forgotBtn.click();
  await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).first().fill(email);
  await page.getByRole('button', { name: /send reset|reset password|recover/i }).last().click();
}

/**
 * Workspace Shell & LeftSidebar opaque-box actions (PROJECT.md § F12, § F16)
 */
export async function openSidebarSection(page: Page, section: SidebarSection): Promise<void> {
  await page.locator('nav').waitFor({ state: 'visible', timeout: 20_000 });
  if (section === 'Vault' || section === 'Assets' || section === 'Templates') {
    const drawerTabBtn = page
      .locator('aside button')
      .filter({ hasText: new RegExp(`^${section}$`, 'i') })
      .first();
    if (await drawerTabBtn.isVisible().catch(() => false)) {
      await drawerTabBtn.click();
      return;
    }
  }
  const patterns: Record<SidebarSection, RegExp> = {
    Vault: /vault|world|lore/i,
    Journals: /journals?/i,
    Characters: /characters?/i,
    'Sheet Studio': /sheet studio|sheets?/i,
    Timeline: /timeline|calendar/i,
    Assets: /assets?/i,
    Templates: /templates?/i,
    Profile: /profile|campaigns?|hub/i,
  };
  const sidebarBtn = page.locator('nav').getByRole('button', { name: patterns[section] }).first();
  if ((await sidebarBtn.count()) > 0) {
    await sidebarBtn.click();
    return;
  }
  await page.getByRole('button', { name: patterns[section] }).first().click();
}

export async function openProfileCampaignHub(page: Page): Promise<void> {
  await openSidebarSection(page, 'Profile');
}

export async function createCampaignInHub(
  page: Page,
  opts: {
    name: string;
    mode?: 'normal' | 'west_marches';
    seedStarter?: boolean;
    maxPlayersPerParty?: number;
  },
): Promise<void> {
  const nameInput = page
    .getByLabel(/campaign name|world name/i)
    .or(page.getByPlaceholder(/campaign name|world name|chronicles/i))
    .first();
  if (!(await nameInput.isVisible().catch(() => false))) {
    const createTrigger = page.getByRole('button', { name: /new campaign|create campaign/i }).first();
    if (await createTrigger.isVisible().catch(() => false)) {
      await createTrigger.click();
    }
  }
  await nameInput.fill(opts.name);

  if (opts.mode) {
    const modeSelect = page.getByLabel(/mode|campaign mode/i).first();
    if (await modeSelect.isVisible().catch(() => false)) {
      await modeSelect.selectOption(opts.mode);
    } else {
      const modeBtn = page.getByRole('button', {
        name: opts.mode === 'west_marches' ? /west marches/i : /normal/i,
      }).first();
      if (await modeBtn.isVisible().catch(() => false)) {
        await modeBtn.click();
      }
    }
  }

  if (opts.maxPlayersPerParty !== undefined) {
    const capInput = page.getByLabel(/max players|party size/i).first();
    if (await capInput.isVisible().catch(() => false)) {
      await capInput.fill(String(opts.maxPlayersPerParty));
    }
  }

  if (opts.seedStarter !== undefined) {
    const seedCheckbox = page.getByLabel(/starter|seed/i).first();
    if (await seedCheckbox.isVisible().catch(() => false)) {
      const checked = await seedCheckbox.isChecked();
      if (checked !== opts.seedStarter) {
        await seedCheckbox.click();
      }
    }
  }

  await page.getByRole('button', { name: /^create( campaign)?$/i }).last().click();
}

export async function joinCampaignByInviteCodeInHub(page: Page, inviteCode: string): Promise<void> {
  const input = page
    .getByLabel(/invite code/i)
    .or(page.getByPlaceholder(/invite code/i))
    .first();
  await input.fill(inviteCode);
  await page.getByRole('button', { name: /join( campaign)?/i }).first().click();
}

/**
 * TopHeader opaque-box actions (PROJECT.md § F10, § F11, § F20)
 */
export async function getGmModeToggle(page: Page): Promise<Locator> {
  return page
    .locator('header')
    .getByRole('button', { name: /gm mode|gm view|player view/i })
    .or(page.getByRole('switch', { name: /gm mode/i }))
    .first();
}

export async function toggleDiceDrawer(page: Page): Promise<void> {
  await page
    .locator('header')
    .getByRole('button', { name: /dice|roller/i })
    .first()
    .click();
}

export async function switchCampaignInHeader(page: Page, campaignName: string): Promise<void> {
  await page.locator('header').waitFor({ state: 'visible', timeout: 20_000 });
  const selectSwitcher = page.locator('header select').first();
  const trigger = page.locator('header button[aria-label="Switch Campaign"]').first();
  await selectSwitcher.or(trigger).first().waitFor({ state: 'visible', timeout: 20_000 });

  if (await selectSwitcher.isVisible().catch(() => false)) {
    await selectSwitcher.selectOption({ label: campaignName });
    return;
  }
  await trigger.click();
  await page
    .locator('header [role="listbox"] button, header [role="menu"] button')
    .filter({ hasText: campaignName })
    .first()
    .click();
}

/**
 * RightInspector & Safe-Inset Layout Helpers (PROJECT.md § Interface Contracts § 2, § F25)
 */
export async function getRightInspectorToggle(page: Page): Promise<Locator> {
  return page.getByRole('button', { name: /inspector|collapse inspector|expand inspector/i }).first();
}

export async function getViewportHudOverlay(page: Page): Promise<Locator> {
  const mainOrBody = page.locator('main, [data-viewport], body').first();
  const toolbar = mainOrBody
    .locator('[role="toolbar"], [aria-label*="viewport" i], [aria-label*="zoom" i], [aria-label*="controls" i]')
    .first();
  if (await toolbar.isVisible().catch(() => false)) {
    return toolbar;
  }

  return mainOrBody
    .getByRole('button', {
      name: /zoom in|zoom out|reset (view|camera)|fit view|worldsmith|fog brush|2d battlemap|3d map|open full/i,
    })
    .first();
}

export async function assertNoHudOverlapWithInspector(
  page: Page,
  hudLocator: Locator,
  inspectorLocator: Locator,
): Promise<void> {
  const hudBox = await hudLocator.boundingBox();
  const inspBox = await inspectorLocator.boundingBox();
  expect(hudBox, 'HUD element bounding box must exist').not.toBeNull();
  expect(inspBox, 'Inspector bounding box must exist').not.toBeNull();
  expect(hudBox!.x + hudBox!.width).toBeLessThanOrEqual(inspBox!.x + 2);
  void page;
}

/**
 * CommandPalette opaque-box actions (PROJECT.md § F16)
 */
export async function openCommandPalette(page: Page): Promise<void> {
  await page.locator('header').waitFor({ state: 'visible', timeout: 20_000 });
  await page.keyboard.press('Control+k');
}

export async function searchCommandPalette(page: Page, query: string): Promise<void> {
  const input = page
    .getByRole('dialog')
    .getByRole('textbox')
    .or(page.getByPlaceholder(/search|command/i))
    .first();
  await input.fill(query);
}

/**
 * PlayerJournalsPane & JournalShareModal opaque-box actions (PROJECT.md § F14)
 */
export async function createJournalPage(page: Page, title: string): Promise<void> {
  await openSidebarSection(page, 'Journals');
  await page.getByRole('button', { name: /new (page|journal|note)/i }).first().click();
  const titleInput = page.getByLabel(/title/i).or(page.getByPlaceholder(/title/i)).first();
  await titleInput.fill(title);
}

export async function openJournalShareModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^share$/i }).first().click();
}

/**
 * SheetTemplateStudio & SandboxedCharacterSheet opaque-box actions (PROJECT.md § F18, § Interface Contracts § 3)
 */
export async function getSheetSandboxIframe(page: Page): Promise<FrameLocator> {
  const frameEl = page.locator('iframe[sandbox]').first();
  await frameEl.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(frameEl).toHaveAttribute('data-hydrated', 'true', { timeout: 10_000 });
  const frame = page.frameLocator('iframe[sandbox]');
  const root = frame.locator('#vault-sheet-root');
  await root.waitFor({ state: 'visible', timeout: 10_000 });
  await root.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  return frame;
}

export async function getSheetSandboxIframeElement(page: Page): Promise<Locator> {
  return page.locator('iframe[sandbox]').first();
}

/**
 * CharacterManagerPane opaque-box actions (PROJECT.md § F19)
 */
export async function createCharacterInPane(page: Page, name: string): Promise<void> {
  await openSidebarSection(page, 'Characters');
  const trigger = page
    .getByRole('button', { name: /^\s*new$|^create my character$|^new character$/i })
    .first();
  await trigger.click();
  await page
    .getByLabel(/character name|name/i)
    .or(page.getByPlaceholder(/character name|name/i))
    .first()
    .fill(name);
  await page.getByRole('button', { name: /^create character$|^save$/i }).last().click();
}

/**
 * DiceRollerDrawer opaque-box actions (PROJECT.md § F20)
 */
export async function rollDiceInDrawer(page: Page, expression: string, options?: { blindGm?: boolean }): Promise<void> {
  const input = page.getByLabel('Dice Expression').or(page.getByPlaceholder(/1d20/i)).first();
  await input.fill(expression);
  if (options?.blindGm !== undefined) {
    const blindToggle = page.getByLabel(/blind|gm only/i).first();
    if (await blindToggle.isVisible().catch(() => false)) {
      const checked = await blindToggle.isChecked();
      if (checked !== options.blindGm) await blindToggle.click();
    }
  }
  await page.getByRole('button', { name: /^roll$/i }).first().click();
}

/**
 * GuildQuestBoardModal opaque-box actions (PROJECT.md § F23)
 */
export async function createGuildQuestInModal(
  page: Page,
  opts: { title: string; maxPlayers: number; description?: string },
): Promise<void> {
  await page.getByRole('button', { name: /post quest|new quest|add quest|create quest/i }).first().click();
  await page.getByLabel(/title/i).or(page.getByPlaceholder(/quest title|title/i)).first().fill(opts.title);
  await page.getByLabel(/max players|party cap|capacity/i).first().fill(String(opts.maxPlayers));
  if (opts.description) {
    await page.getByLabel(/description/i).or(page.getByPlaceholder(/description/i)).first().fill(opts.description);
  }
  await page.getByRole('button', { name: /^create$|save|post quest/i }).last().click();
}

/**
 * CampaignTimelinePane opaque-box actions (PROJECT.md § F15)
 */
export async function openTimelinePane(page: Page): Promise<void> {
  await openSidebarSection(page, 'Timeline');
}

/**
 * Canvas / WebGL2 / 2D Battlemap & InitiativeTrackerBar helpers (PROJECT.md § F22, § F24, § F25)
 */
export async function getPrimaryViewportCanvas(page: Page): Promise<Locator> {
  return page.locator('canvas').first();
}

export async function triggerWorldsmithUndo(page: Page): Promise<void> {
  await page.keyboard.press('Control+z');
}

export async function advanceInitiativeTurn(page: Page): Promise<void> {
  await page.getByRole('button', { name: /next turn/i }).first().click();
}
