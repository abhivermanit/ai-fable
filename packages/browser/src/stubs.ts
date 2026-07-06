import type {
  BrowserRuntime,
  BrowserPlanner,
  BrowserAuthorizer,
  BrowserVerifier,
  BrowserAction,
  BrowserPlan,
  BrowserTask,
  ActionResult,
  AuthorizationResult,
  VerifyResult,
} from './types.js';

/**
 * Stub runtime that simulates browser actions deterministically.
 *
 * Used for testing the agent state machine without Playwright.
 */
export class StubRuntime implements BrowserRuntime {
  private url = 'about:blank';
  private title = '';
  public executedActions: BrowserAction[] = [];

  /** Configure what extract/assert actions return */
  public extractValues = new Map<string, string>();

  /** Configure which actions should fail */
  public failActions = new Set<string>();

  async execute(action: BrowserAction): Promise<ActionResult> {
    this.executedActions.push(action);
    const start = Date.now();

    // Check if this action type should fail
    if (this.failActions.has(action.type)) {
      return {
        action,
        success: false,
        error: `Simulated failure for action: ${action.type}`,
        durationMs: Date.now() - start,
      };
    }

    switch (action.type) {
      case 'open':
        this.url = action.url;
        this.title = `Page: ${action.url}`;
        return { action, success: true, durationMs: Date.now() - start };

      case 'extract': {
        const value = this.extractValues.get(action.selector) ?? `extracted:${action.selector}`;
        return { action, success: true, value, durationMs: Date.now() - start };
      }

      case 'assert': {
        const actual = this.extractValues.get(action.selector) ?? '';
        const passed = actual === action.expected;
        return {
          action,
          success: passed,
          value: actual,
          error: passed ? undefined : `Expected "${action.expected}", got "${actual}"`,
          durationMs: Date.now() - start,
        };
      }

      case 'screenshot':
        return { action, success: true, screenshot: 'stub-screenshot.png', durationMs: Date.now() - start };

      case 'click':
      case 'type':
      case 'search':
      case 'scroll':
      case 'navigate':
      case 'wait':
        return { action, success: true, durationMs: Date.now() - start };

      default:
        return { action, success: true, durationMs: Date.now() - start };
    }
  }

  async currentUrl(): Promise<string> {
    return this.url;
  }

  async pageTitle(): Promise<string> {
    return this.title;
  }

  async close(): Promise<void> {
    // no-op
  }
}

/**
 * Stub planner that returns a configurable plan.
 */
export class StubPlanner implements BrowserPlanner {
  /** The plan to return */
  public plan_: BrowserPlan = { actions: [], reasoning: 'stub plan' };

  /** Plan to return on replan (defaults to same as plan) */
  public replan_?: BrowserPlan;

  async plan(_task: BrowserTask): Promise<BrowserPlan> {
    return this.plan_;
  }

  async replan(_task: BrowserTask, _prev: ActionResult[], _reason: string): Promise<BrowserPlan> {
    return this.replan_ ?? this.plan_;
  }
}

/**
 * Stub authorizer that always approves (or can be configured to deny).
 */
export class StubAuthorizer implements BrowserAuthorizer {
  public authorized = true;
  public reason?: string;

  async authorize(_task: BrowserTask, _plan: BrowserPlan): Promise<AuthorizationResult> {
    return {
      authorized: this.authorized,
      reason: this.reason,
      overridable: true,
    };
  }
}

/**
 * Stub verifier that checks extract action results against expected output.
 */
export class StubVerifier implements BrowserVerifier {
  public passed = true;
  public reason?: string;
  public data: Record<string, string> = {};

  async verify(task: BrowserTask, actions: ActionResult[]): Promise<VerifyResult> {
    // Auto-collect extracted values
    const extracted: Record<string, string> = {};
    for (const result of actions) {
      if (result.action.type === 'extract' && result.value) {
        extracted[result.action.selector] = result.value;
      }
    }

    return {
      passed: this.passed,
      data: { ...extracted, ...this.data },
      reason: this.passed ? undefined : this.reason,
    };
  }
}
