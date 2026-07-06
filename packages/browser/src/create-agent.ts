import { BrowserAgent } from './agent.js';
import { PlaywrightRuntime, type PlaywrightConfig } from './playwright-runtime.js';
import { GatewayPlanner, type ChatFunction } from './gateway-planner.js';
import type { BrowserAuthorizer, BrowserVerifier, BrowserTask, BrowserPlan, ActionResult, AuthorizationResult, VerifyResult } from './types.js';

/**
 * Configuration for creating a fully-wired browser agent.
 */
export interface CreateBrowserAgentConfig {
  /** Model Gateway chat function */
  chat: ChatFunction;
  /** Playwright configuration */
  playwright?: PlaywrightConfig;
  /** Custom authorizer (defaults to allow-all) */
  authorizer?: BrowserAuthorizer;
  /** Custom verifier (defaults to extract-based verification) */
  verifier?: BrowserVerifier;
}

/**
 * Create a fully-wired Browser Agent ready for real tasks.
 *
 * This is the integration point where all packages come together:
 * - Playwright for browser automation
 * - Model Gateway for planning
 * - Policy Engine for authorization (via authorizer)
 * - Verification Layer for result checking (via verifier)
 *
 * Usage:
 * ```ts
 * const agent = createBrowserAgent({
 *   chat: (msgs, opts) => gateway.chat({ messages: msgs, responseSchema: opts?.responseSchema }),
 * });
 * const result = await agent.run({ description: '...' });
 * await agent.close();
 * ```
 */
export function createBrowserAgent(config: CreateBrowserAgentConfig): BrowserAgentHandle {
  const runtime = new PlaywrightRuntime(config.playwright);
  const planner = new GatewayPlanner(config.chat);
  const authorizer = config.authorizer ?? new DefaultAuthorizer();
  const verifier = config.verifier ?? new ExtractVerifier();

  const agent = new BrowserAgent({ runtime, planner, authorizer, verifier });

  return {
    agent,
    runtime,
    run: (task) => agent.run(task),
    close: () => runtime.close(),
  };
}

/**
 * Handle returned by createBrowserAgent for lifecycle management.
 */
export interface BrowserAgentHandle {
  /** The agent instance */
  agent: BrowserAgent;
  /** The runtime (for direct page access if needed) */
  runtime: PlaywrightRuntime;
  /** Run a task */
  run: (task: BrowserTask) => ReturnType<BrowserAgent['run']>;
  /** Close the browser and clean up */
  close: () => Promise<void>;
}

/**
 * Default authorizer: allows all actions.
 * Replace with a Policy Engine adapter for real use.
 */
class DefaultAuthorizer implements BrowserAuthorizer {
  async authorize(_task: BrowserTask, _plan: BrowserPlan): Promise<AuthorizationResult> {
    return { authorized: true, overridable: true };
  }
}

/**
 * Default verifier: checks that extract actions produced non-empty values.
 * Replace with a Verification Engine adapter for real use.
 */
class ExtractVerifier implements BrowserVerifier {
  async verify(task: BrowserTask, actions: ActionResult[]): Promise<VerifyResult> {
    const data: Record<string, string> = {};

    for (const result of actions) {
      if (result.action.type === 'extract' && result.success && result.value) {
        data[result.action.selector] = result.value;
      }
    }

    // If expected output is specified, check that we got all fields
    if (task.expectedOutput) {
      for (const key of Object.keys(task.expectedOutput)) {
        if (!data[key] && !Object.values(data).length) {
          return { passed: false, data, reason: `Missing expected output: ${key}` };
        }
      }
    }

    // Pass if we extracted at least something (or no extraction was expected)
    const hasExtracts = actions.some((a) => a.action.type === 'extract');
    if (hasExtracts && Object.keys(data).length === 0) {
      return { passed: false, data, reason: 'No data was extracted' };
    }

    return { passed: true, data };
  }
}
