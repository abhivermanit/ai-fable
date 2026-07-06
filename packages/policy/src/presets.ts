import type { PolicyConfig, PolicyRule } from './types.js';

/**
 * Default policy configuration.
 *
 * Provides sensible defaults for a solo developer workflow:
 * - Execution allowed by default
 * - Protected files (.env, secrets) blocked
 * - Push to main requires approval
 * - Shell commands allowed (except dangerous ones)
 * - Conservative retry limits (per ADR-0005)
 * - Default model selection
 */
export function defaultPolicyConfig(): PolicyConfig {
  return {
    version: '1.0.0-default',
    rules: [
      ...protectedFileRules(),
      ...branchProtectionRules(),
      ...commandRestrictionRules(),
      ...retryRules(),
      ...resourceRules(),
      ...approvalRules(),
    ],
    defaultDecision: {
      allowed: true,
      reason: 'No matching policy rule — allowed by default',
      overridable: true,
    },
  };
}

/**
 * Strict policy configuration.
 *
 * Everything requires explicit approval. For production or team use.
 */
export function strictPolicyConfig(): PolicyConfig {
  return {
    version: '1.0.0-strict',
    rules: [
      ...protectedFileRules(),
      ...branchProtectionRules(),
      ...commandRestrictionRules(),
      ...retryRules(),
      ...resourceRules(),
      {
        id: 'strict-approval-all',
        description: 'All actions require human approval',
        appliesTo: ['requires-approval'],
        condition: { always: true },
        decision: { allowed: true, reason: 'Strict mode: approval required for all actions', overridable: false },
        priority: 100,
        enabled: true,
      },
    ],
    defaultDecision: {
      allowed: false,
      reason: 'Strict mode: denied by default',
      overridable: true,
    },
  };
}

// --- Rule Sets ---

/**
 * Rules protecting sensitive files.
 */
export function protectedFileRules(): PolicyRule[] {
  return [
    {
      id: 'protect-env-files',
      description: 'Block modification of .env files',
      appliesTo: ['may-modify-file'],
      condition: { filePath: '*.env*' },
      decision: { allowed: false, reason: 'Environment files are protected', overridable: true },
      priority: 90,
      enabled: true,
    },
    {
      id: 'protect-secrets',
      description: 'Block modification of secrets and credentials',
      appliesTo: ['may-modify-file'],
      condition: { filePath: '*secret*' },
      decision: { allowed: false, reason: 'Secret files are protected', overridable: true },
      priority: 90,
      enabled: true,
    },
    {
      id: 'protect-git-config',
      description: 'Block modification of .git directory',
      appliesTo: ['may-modify-file'],
      condition: { filePath: '.git/*' },
      decision: { allowed: false, reason: '.git directory is protected', overridable: false },
      priority: 100,
      enabled: true,
    },
    {
      id: 'protect-lockfiles',
      description: 'Block direct modification of lockfiles',
      appliesTo: ['may-modify-file'],
      condition: { filePath: '*lock*' },
      decision: { allowed: false, reason: 'Lockfiles should only be modified by package managers', overridable: true },
      priority: 80,
      enabled: true,
    },
  ];
}

/**
 * Rules protecting branches.
 */
export function branchProtectionRules(): PolicyRule[] {
  return [
    {
      id: 'protect-main-push',
      description: 'Push to main/master requires approval',
      appliesTo: ['may-push'],
      condition: { branch: 'main' },
      decision: { allowed: false, reason: 'Push to main requires approval', overridable: true },
      priority: 90,
      enabled: true,
    },
    {
      id: 'protect-master-push',
      description: 'Push to master requires approval',
      appliesTo: ['may-push'],
      condition: { branch: 'master' },
      decision: { allowed: false, reason: 'Push to master requires approval', overridable: true },
      priority: 90,
      enabled: true,
    },
    {
      id: 'allow-task-branch-push',
      description: 'Allow push to task branches',
      appliesTo: ['may-push'],
      condition: { branch: 'task/*' },
      decision: { allowed: true, reason: 'Task branches can be pushed freely', overridable: false },
      priority: 80,
      enabled: true,
    },
  ];
}

/**
 * Rules restricting shell commands.
 */
export function commandRestrictionRules(): PolicyRule[] {
  return [
    {
      id: 'block-rm-rf',
      description: 'Block recursive force delete',
      appliesTo: ['may-run-command'],
      condition: { command: '*rm -rf /*' },
      decision: { allowed: false, reason: 'Recursive force delete of root paths is blocked', overridable: false },
      priority: 100,
      enabled: true,
    },
    {
      id: 'block-force-push',
      description: 'Block git force push',
      appliesTo: ['may-run-command'],
      condition: { command: '*push*--force*' },
      decision: { allowed: false, reason: 'Force push is blocked by policy', overridable: true },
      priority: 95,
      enabled: true,
    },
    {
      id: 'block-reset-hard',
      description: 'Block git reset --hard',
      appliesTo: ['may-run-command'],
      condition: { command: '*reset*--hard*' },
      decision: { allowed: false, reason: 'Hard reset is blocked by policy', overridable: true },
      priority: 95,
      enabled: true,
    },
  ];
}

/**
 * Retry policy rules.
 */
export function retryRules(): PolicyRule[] {
  return [
    {
      id: 'max-retries-default',
      description: 'Default maximum retries (per ADR-0005: cap conservatively)',
      appliesTo: ['max-retries'],
      condition: { always: true },
      decision: { allowed: true, reason: 'Default retry limit', overridable: true, value: 1 },
      priority: 50,
      enabled: true,
    },
    {
      id: 'should-retry-default',
      description: 'Allow retry if under the limit',
      appliesTo: ['should-retry'],
      condition: { always: true },
      decision: { allowed: true, reason: 'Retry allowed within limits', overridable: true },
      priority: 50,
      enabled: true,
    },
  ];
}

/**
 * Resource allocation rules.
 */
export function resourceRules(): PolicyRule[] {
  return [
    {
      id: 'default-timeout',
      description: 'Default execution timeout: 5 minutes',
      appliesTo: ['max-timeout'],
      condition: { always: true },
      decision: { allowed: true, reason: 'Default timeout', overridable: true, value: 300_000 },
      priority: 50,
      enabled: true,
    },
    {
      id: 'default-concurrency',
      description: 'Default max concurrency: 1 task at a time',
      appliesTo: ['max-concurrency'],
      condition: { always: true },
      decision: { allowed: true, reason: 'Default concurrency limit', overridable: true, value: 1 },
      priority: 50,
      enabled: true,
    },
    {
      id: 'default-model',
      description: 'Default model selection',
      appliesTo: ['select-model'],
      condition: { always: true },
      decision: { allowed: true, reason: 'Default model', overridable: true, value: 'claude-sonnet' },
      priority: 50,
      enabled: true,
    },
  ];
}

/**
 * Approval policy rules.
 */
export function approvalRules(): PolicyRule[] {
  return [
    {
      id: 'approve-push-to-protected',
      description: 'Push to protected branches requires approval',
      appliesTo: ['requires-approval'],
      condition: { branch: 'main' },
      decision: { allowed: true, reason: 'Push to main requires human approval', overridable: false },
      priority: 90,
      enabled: true,
    },
    {
      id: 'auto-approve-task-branch',
      description: 'Task branch operations auto-approved',
      appliesTo: ['requires-approval'],
      condition: { branch: 'task/*' },
      decision: { allowed: false, reason: 'Task branch operations do not require approval', overridable: false },
      priority: 80,
      enabled: true,
    },
  ];
}
