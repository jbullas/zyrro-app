/**
 * Thin Playwright wrapper for live verification passes. Not a test framework —
 * just removes the per-session boilerplate of opening an authenticated page
 * and running the two checks already in standing practice: a computed-style
 * read and a screenshot.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const SCREENSHOT_DIR = path.join(process.cwd(), '.verification-runs', 'screenshots');

export interface VerificationDriver {
  page: Page;
  goto(route: string, baseUrl?: string): Promise<void>;
  computedStyle(selector: string, property: string, pseudoElement?: string): Promise<string>;
  screenshot(name: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Opens a browser context from a saved storageState (see bootstrapTestUser
 * in session.mts). Headless by default — pass headless: false to watch it run.
 */
export async function openDriver(
  storageStatePath: string,
  opts: { headless?: boolean } = {}
): Promise<VerificationDriver> {
  const browser: Browser = await chromium.launch({ headless: opts.headless ?? true });
  const context: BrowserContext = await browser.newContext({ storageState: storageStatePath });
  const page: Page = await context.newPage();

  return {
    page,

    async goto(route: string, baseUrl = 'http://localhost:3000') {
      await page.goto(`${baseUrl}${route}`);
    },

    async computedStyle(selector: string, property: string, pseudoElement?: string) {
      return page.evaluate(
        ({ selector, property, pseudoElement }) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`computedStyle: no element matched "${selector}"`);
          return getComputedStyle(el, pseudoElement ?? null).getPropertyValue(property);
        },
        { selector, property, pseudoElement }
      );
    },

    async screenshot(name: string) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
      await page.screenshot({ path: filePath });
      return filePath;
    },

    async close() {
      await browser.close();
    },
  };
}
