import type { ChatMessage, ToolDefinition } from './types.js';

/**
 * A prompt template with variable substitution.
 *
 * The Orchestrator never concatenates prompts directly.
 * It uses templates that the gateway renders into messages.
 */
export interface PromptTemplate {
  /** Template name for identification */
  name: string;
  /** System prompt template (supports {{variable}} interpolation) */
  system?: string;
  /** User message template */
  user?: string;
  /** Required variables */
  variables: string[];
  /** Tools available in this template */
  tools?: ToolDefinition[];
  /** Output schema (for structured output) */
  outputSchema?: Record<string, unknown>;
}

/**
 * Render a prompt template with variables into chat messages.
 */
export function renderTemplate(
  template: PromptTemplate,
  variables: Record<string, string>,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Validate required variables
  for (const key of template.variables) {
    if (!(key in variables)) {
      throw new PromptRenderError(`Missing required variable: ${key}`, template.name, key);
    }
  }

  // Render system message
  if (template.system) {
    messages.push({
      role: 'system',
      content: interpolate(template.system, variables),
    });
  }

  // Render user message
  if (template.user) {
    messages.push({
      role: 'user',
      content: interpolate(template.user, variables),
    });
  }

  return messages;
}

/**
 * Interpolate {{variable}} placeholders in a string.
 */
function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) return variables[key];
    return match; // Leave unresolved placeholders as-is
  });
}

/**
 * Create a simple prompt template.
 */
export function createTemplate(params: {
  name: string;
  system?: string;
  user?: string;
  variables?: string[];
  tools?: ToolDefinition[];
  outputSchema?: Record<string, unknown>;
}): PromptTemplate {
  // Auto-detect variables from template strings
  const detectedVars = new Set<string>();
  if (params.system) {
    for (const match of params.system.matchAll(/\{\{(\w+)\}\}/g)) {
      detectedVars.add(match[1]);
    }
  }
  if (params.user) {
    for (const match of params.user.matchAll(/\{\{(\w+)\}\}/g)) {
      detectedVars.add(match[1]);
    }
  }

  return {
    name: params.name,
    system: params.system,
    user: params.user,
    variables: params.variables ?? [...detectedVars],
    tools: params.tools,
    outputSchema: params.outputSchema,
  };
}

/**
 * Error thrown during prompt rendering.
 */
export class PromptRenderError extends Error {
  public readonly templateName: string;
  public readonly missingVariable: string;

  constructor(message: string, templateName: string, missingVariable: string) {
    super(message);
    this.name = 'PromptRenderError';
    this.templateName = templateName;
    this.missingVariable = missingVariable;
  }
}
