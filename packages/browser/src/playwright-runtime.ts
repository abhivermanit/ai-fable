import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import type { BrowserRuntime, BrowserAction, ActionResult } from './types.js';

/**
 * Configuration for the Playwright runtime.
 */
export interface PlaywrightConfig {
  /** Run in headless mode (default: true) */
  headless?: boolean;
  /** Default timeout for actions in ms (default: 30000) */
  timeoutMs?: number;
  /** Viewport width (default: 1280) */
  viewportWidth?: number;
  /** Viewport height (default: 720) */
  viewportHeight?: number;
  /** User agent string */
  userAgent?: string;
}

/**
 * Playwright-backed browser runtime.
 *
 * Translates high-level BrowserActions into Playwright operations.
 * The planner never imports Playwright — this is the only file that does.
 */
export class PlaywrightRuntime implements BrowserRuntime {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private readonly config: Required<PlaywrightConfig>;

  constructor(config?: PlaywrightConfig) {
    this.config = {
      headless: config?.headless ?? true,
      timeoutMs: config?.timeoutMs ?? 30_000,
      viewportWidth: config?.viewportWidth ?? 1280,
      viewportHeight: config?.viewportHeight ?? 720,
      userAgent: config?.userAgent ?? '',
    };
  }

  /**
   * Ensure browser is launched and page is available.
   */
  private async ensurePage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.config.headless });
      this.context = await this.browser.newContext({
        viewport: { width: this.config.viewportWidth, height: this.config.viewportHeight },
        userAgent: this.config.userAgent || undefined,
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.timeoutMs);
    }
    return this.page!;
  }

  /**
   * Execute a single browser action.
   */
  async execute(action: BrowserAction): Promise<ActionResult> {
    const start = Date.now();
    try {
      const page = await this.ensurePage();
      const result = await this.dispatch(page, action);
      return { ...result, durationMs: Date.now() - start };
    } catch (error) {
      return {
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Dispatch an action to the appropriate Playwright method.
   */
  private async dispatch(page: Page, action: BrowserAction): Promise<Omit<ActionResult, 'durationMs'>> {
    switch (action.type) {
      case 'open':
        await page.goto(action.url, { waitUntil: 'domcontentloaded' });
        return { action, success: true };

      case 'click':
        await page.click(action.selector);
        return { action, success: true };

      case 'type':
        await page.fill(action.selector, action.text);
        return { action, success: true };

      case 'extract': {
        const element = await page.$(action.selector);
        if (!element) {
          return { action, success: false, error: `Element not found: ${action.selector}` };
        }
        let value: string;
        if (action.attribute) {
          value = await element.getAttribute(action.attribute) ?? '';
        } else {
          value = await element.innerText();
        }
        return { action, success: true, value: value.trim() };
      }

      case 'search':
        // Generic search: type into search input and press Enter
        // Assumes a common search pattern; specific sites may need custom logic
        await page.fill('input[type="search"], input[name="q"], input[name="search"], #search', action.query);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        return { action, success: true };

      case 'wait':
        if (action.condition.kind === 'selector') {
          await page.waitForSelector(action.condition.selector);
        } else if (action.condition.kind === 'navigation') {
          await page.waitForLoadState('domcontentloaded');
        } else if (action.condition.kind === 'timeout') {
          await page.waitForTimeout(action.condition.ms);
        }
        return { action, success: true };

      case 'screenshot': {
        const path = action.label ? `screenshots/${action.label}.png` : `screenshots/screenshot-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: false });
        return { action, success: true, screenshot: path };
      }

      case 'scroll': {
        const amount = action.amount ?? 500;
        const dir = action.direction === 'down' ? amount : -amount;
        await page.evaluate(`window.scrollBy(0, ${dir})`);
        return { action, success: true };
      }

      case 'navigate':
        if (action.direction === 'back') {
          await page.goBack();
        } else {
          await page.goForward();
        }
        return { action, success: true };

      case 'assert': {
        const el = await page.$(action.selector);
        if (!el) {
          return { action, success: false, error: `Element not found: ${action.selector}` };
        }
        const text = (await el.innerText()).trim();
        if (text === action.expected) {
          return { action, success: true, value: text };
        }
        return { action, success: false, value: text, error: `Expected "${action.expected}", got "${text}"` };
      }

      default:
        return { action, success: false, error: `Unknown action type: ${(action as BrowserAction).type}` };
    }
  }

  async currentUrl(): Promise<string> {
    const page = await this.ensurePage();
    return page.url();
  }

  async pageTitle(): Promise<string> {
    const page = await this.ensurePage();
    return page.title();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.context = undefined;
      this.page = undefined;
    }
  }
}
