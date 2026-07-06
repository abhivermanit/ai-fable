import type { ChatResponse } from './types.js';

/**
 * Parse and validate structured JSON output from a model response.
 *
 * The rest of AI-Fable should never parse raw model text.
 * This module ensures every model output is validated against
 * its expected schema before reaching consumer code.
 */
export function parseStructuredOutput<T>(
  response: ChatResponse,
  schema?: Record<string, unknown>,
): StructuredOutput<T> {
  const content = response.message.content.trim();

  // Try to extract JSON from the response
  const jsonStr = extractJson(content);
  if (!jsonStr) {
    return {
      success: false,
      error: 'No JSON found in model response',
      raw: content,
    };
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      success: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw: content,
    };
  }

  // Validate against schema (basic validation)
  if (schema) {
    const validation = validateBasic(parsed, schema);
    if (!validation.valid) {
      return {
        success: false,
        error: `Schema validation failed: ${validation.errors.join(', ')}`,
        raw: content,
        parsed: parsed as T,
      };
    }
  }

  return {
    success: true,
    data: parsed as T,
    raw: content,
  };
}

/**
 * Result of parsing structured output.
 */
export type StructuredOutput<T> =
  | { success: true; data: T; raw: string }
  | { success: false; error: string; raw: string; parsed?: T };

/**
 * Extract JSON from a model response.
 *
 * Handles common patterns:
 * - Pure JSON response
 * - JSON wrapped in markdown code blocks
 * - JSON embedded in text
 */
export function extractJson(content: string): string | undefined {
  const trimmed = content.trim();

  // Already valid JSON (starts with { or [)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  // JSON in markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // JSON object embedded in text (find first { and last })
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  // JSON array embedded in text
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  return undefined;
}

/**
 * Basic schema validation (checks required fields and types).
 *
 * This is intentionally simple — not a full JSON Schema validator.
 * For production use, a proper validator (ajv, zod) should replace this.
 *
 * TODO: Replace with ajv or zod-based validation once dependencies are decided.
 */
function validateBasic(
  data: unknown,
  schema: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Expected object, got ' + typeof data] };
  }

  // Check required fields
  const required = schema['required'] as string[] | undefined;
  if (required && Array.isArray(required)) {
    for (const field of required) {
      if (!(field in (data as Record<string, unknown>))) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check property types (basic)
  const properties = schema['properties'] as Record<string, { type?: string }> | undefined;
  if (properties) {
    const obj = data as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj && propSchema.type) {
        const actual = Array.isArray(obj[key]) ? 'array' : typeof obj[key];
        if (actual !== propSchema.type && obj[key] !== null) {
          errors.push(`Field "${key}": expected ${propSchema.type}, got ${actual}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
