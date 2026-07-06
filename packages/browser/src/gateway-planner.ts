import type { BrowserPlanner, BrowserTask, BrowserPlan, ActionResult, BrowserAction } from './types.js';

/**
 * Interface for the Model Gateway chat function.
 *
 * This avoids importing @ai-fable/models directly — the caller
 * passes in the gateway's chat function at construction.
 */
export interface ChatFunction {
  (messages: Array<{ role: string; content: string }>, options?: { responseSchema?: Record<string, unknown> }): Promise<{ content: string }>;
}

/**
 * Browser planner backed by the Model Gateway.
 *
 * Generates browser action plans by asking an LLM to reason about
 * the task and produce a structured list of actions.
 */
export class GatewayPlanner implements BrowserPlanner {
  private readonly chat: ChatFunction;

  constructor(chat: ChatFunction) {
    this.chat = chat;
  }

  async plan(task: BrowserTask): Promise<BrowserPlan> {
    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildPlanPrompt(task);

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { responseSchema: PLAN_SCHEMA });

    return parsePlanResponse(response.content);
  }

  async replan(task: BrowserTask, previousActions: ActionResult[], failureReason: string): Promise<BrowserPlan> {
    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildReplanPrompt(task, previousActions, failureReason);

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { responseSchema: PLAN_SCHEMA });

    return parsePlanResponse(response.content);
  }
}

// --- Prompts ---

const SYSTEM_PROMPT = `You are a browser automation planner. Given a task description, generate a sequence of browser actions to accomplish it.

Available actions:
- open: Navigate to a URL. Parameters: url
- click: Click an element. Parameters: selector (CSS selector)
- type: Type text into an input. Parameters: selector, text
- extract: Extract text from an element. Parameters: selector, attribute (optional)
- search: Type into a search input and press Enter. Parameters: query
- wait: Wait for a condition. Parameters: condition (selector/navigation/timeout)
- screenshot: Take a screenshot. Parameters: label (optional)
- scroll: Scroll the page. Parameters: direction (up/down), amount (optional)
- navigate: Go back or forward. Parameters: direction (back/forward)
- assert: Assert element text matches expected. Parameters: selector, expected

Respond with JSON only:
{
  "reasoning": "your step-by-step reasoning",
  "actions": [
    { "type": "open", "url": "..." },
    { "type": "extract", "selector": "..." }
  ]
}`;

function buildPlanPrompt(task: BrowserTask): string {
  let prompt = `Task: ${task.description}`;
  if (task.startUrl) prompt += `\nStarting URL: ${task.startUrl}`;
  if (task.expectedOutput) {
    prompt += `\nExpected output fields: ${Object.keys(task.expectedOutput).join(', ')}`;
  }
  return prompt;
}

function buildReplanPrompt(task: BrowserTask, previousActions: ActionResult[], failureReason: string): string {
  let prompt = `Task: ${task.description}`;
  if (task.startUrl) prompt += `\nStarting URL: ${task.startUrl}`;
  prompt += `\n\nPrevious attempt failed: ${failureReason}`;
  prompt += `\n\nPrevious actions tried:`;
  for (const result of previousActions) {
    const status = result.success ? '✓' : '✗';
    prompt += `\n  ${status} ${result.action.type}${result.error ? ` (error: ${result.error})` : ''}`;
  }
  prompt += `\n\nPlease generate a new plan that avoids the previous failure.`;
  return prompt;
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['reasoning', 'actions'],
  properties: {
    reasoning: { type: 'string' },
    actions: {
      type: 'array',
      items: { type: 'object' },
    },
  },
};

/**
 * Parse the model's response into a BrowserPlan.
 */
function parsePlanResponse(content: string): BrowserPlan {
  // Extract JSON from response
  const jsonStr = extractJsonFromResponse(content);
  if (!jsonStr) {
    throw new Error('Model did not return valid JSON for the browser plan');
  }

  const parsed = JSON.parse(jsonStr);

  if (!parsed.actions || !Array.isArray(parsed.actions)) {
    throw new Error('Model response missing "actions" array');
  }

  return {
    reasoning: parsed.reasoning ?? '',
    actions: parsed.actions as BrowserAction[],
  };
}

function extractJsonFromResponse(content: string): string | undefined {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) return trimmed;

  const codeBlock = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) return codeBlock[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return undefined;
}
