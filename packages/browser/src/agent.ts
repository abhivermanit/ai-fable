import { AgentState } from './types.js';
import type {
  BrowserTask,
  BrowserPlan,
  ActionResult,
  AgentResult,
  BrowserRuntime,
  BrowserPlanner,
  BrowserAuthorizer,
  BrowserVerifier,
} from './types.js';

/**
 * Configuration for the Browser Agent.
 */
export interface BrowserAgentConfig {
  /** The runtime that executes browser actions */
  runtime: BrowserRuntime;
  /** The planner that generates action plans */
  planner: BrowserPlanner;
  /** The authorizer that checks policy */
  authorizer: BrowserAuthorizer;
  /** The verifier that checks results */
  verifier: BrowserVerifier;
}

/**
 * The Browser Agent.
 *
 * A state machine that coordinates all infrastructure packages
 * to execute browser automation tasks.
 *
 * State transitions:
 *   NEW → PLANNING → AUTHORIZING → EXECUTING → VERIFYING → SUCCESS
 *                                                   │
 *                                             REPLANNING → (loop)
 *                                                   │
 *                                                FAILED
 *
 * Each state maps to a package:
 *   PLANNING    → Model Gateway (via BrowserPlanner)
 *   AUTHORIZING → Policy Engine (via BrowserAuthorizer)
 *   EXECUTING   → Execution Runtime (via BrowserRuntime)
 *   VERIFYING   → Verification Layer (via BrowserVerifier)
 *   REPLANNING  → Model Gateway + Memory
 */
export class BrowserAgent {
  private readonly runtime: BrowserRuntime;
  private readonly planner: BrowserPlanner;
  private readonly authorizer: BrowserAuthorizer;
  private readonly verifier: BrowserVerifier;

  constructor(config: BrowserAgentConfig) {
    this.runtime = config.runtime;
    this.planner = config.planner;
    this.authorizer = config.authorizer;
    this.verifier = config.verifier;
  }

  /**
   * Execute a browser task through the full lifecycle.
   */
  async run(task: BrowserTask): Promise<AgentResult> {
    const startTime = Date.now();
    const maxAttempts = task.maxAttempts ?? 3;
    let state = AgentState.New;
    let allActions: ActionResult[] = [];
    let planAttempts = 0;
    let lastFailureReason: string | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check abort
      if (task.signal?.aborted) {
        return this.makeResult(AgentState.Failed, allActions, planAttempts, startTime, 'Task aborted');
      }

      // --- PLAN ---
      state = attempt === 0 ? AgentState.Planning : AgentState.Replanning;
      planAttempts++;

      let plan: BrowserPlan;
      try {
        if (attempt === 0) {
          plan = await this.planner.plan(task);
        } else {
          plan = await this.planner.replan(task, allActions, lastFailureReason ?? 'Unknown failure');
        }
      } catch (error) {
        return this.makeResult(AgentState.Failed, allActions, planAttempts, startTime,
          `Planning failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // --- AUTHORIZE ---
      state = AgentState.Authorizing;
      const auth = await this.authorizer.authorize(task, plan);
      if (!auth.authorized) {
        return this.makeResult(AgentState.Failed, allActions, planAttempts, startTime,
          `Authorization denied: ${auth.reason ?? 'Policy rejected the plan'}`);
      }

      // --- EXECUTE ---
      state = AgentState.Executing;
      const stepResults = await this.executeActions(plan, task.signal);
      allActions = [...allActions, ...stepResults];

      // Check if any action failed
      const failedAction = stepResults.find((r) => !r.success);
      if (failedAction) {
        lastFailureReason = `Action "${failedAction.action.type}" failed: ${failedAction.error}`;
        continue; // replan
      }

      // --- VERIFY ---
      state = AgentState.Verifying;
      const verification = await this.verifier.verify(task, stepResults);

      if (verification.passed) {
        return {
          state: AgentState.Success,
          success: true,
          actions: allActions,
          data: verification.data,
          durationMs: Date.now() - startTime,
          planAttempts,
        };
      }

      // Verification failed — replan
      lastFailureReason = verification.reason ?? 'Verification failed';
    }

    // All attempts exhausted
    return this.makeResult(AgentState.Failed, allActions, planAttempts, startTime,
      lastFailureReason ?? 'Max attempts exhausted');
  }

  /**
   * Execute a list of browser actions sequentially.
   */
  private async executeActions(plan: BrowserPlan, signal?: AbortSignal): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of plan.actions) {
      if (signal?.aborted) {
        results.push({
          action,
          success: false,
          error: 'Aborted',
          durationMs: 0,
        });
        break;
      }

      const result = await this.runtime.execute(action);
      results.push(result);

      // Stop on failure — don't continue the plan
      if (!result.success) break;
    }

    return results;
  }

  /**
   * Build a result object.
   */
  private makeResult(
    state: AgentState,
    actions: ActionResult[],
    planAttempts: number,
    startTime: number,
    error?: string,
  ): AgentResult {
    return {
      state,
      success: state === AgentState.Success,
      actions,
      data: {},
      error,
      durationMs: Date.now() - startTime,
      planAttempts,
    };
  }
}
