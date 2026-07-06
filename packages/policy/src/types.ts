/**
 * A question posed to the Policy Engine.
 *
 * The Orchestrator asks; the Policy Engine answers.
 * Questions are typed so the engine knows which rules to evaluate.
 */
export interface PolicyQuestion {
  /** The type of question being asked */
  type: PolicyQuestionType;
  /** Context for the decision */
  context: PolicyContext;
}

/**
 * Types of questions the Policy Engine can answer.
 */
export type PolicyQuestionType =
  | 'may-execute'         // May this task execute?
  | 'may-modify-repo'     // May it modify this repository?
  | 'may-modify-file'     // May it modify this specific file?
  | 'may-push'            // May it push commits?
  | 'may-create-pr'       // May it create a pull request?
  | 'may-run-command'     // May it run this shell command?
  | 'requires-approval'   // Does this action require human approval?
  | 'should-retry'        // Should it retry after failure?
  | 'select-model'        // Which model should it use?
  | 'max-timeout'         // What timeout should apply?
  | 'max-retries'         // How many retries are allowed?
  | 'max-concurrency';    // How many concurrent tasks allowed?

/**
 * Context provided with a policy question.
 */
export interface PolicyContext {
  /** Task ID */
  taskId?: string;
  /** Task description */
  taskDescription?: string;
  /** Repository path */
  repository?: string;
  /** Branch name */
  branch?: string;
  /** File path (for file-level policies) */
  filePath?: string;
  /** Command to execute (for command policies) */
  command?: string;
  /** Current retry count */
  retryCount?: number;
  /** Source of the task (cli, ide, api, etc.) */
  source?: string;
  /** Labels on the task */
  labels?: Record<string, string>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * The Policy Engine's answer to a question.
 *
 * Includes full traceability: which rule matched, at which scope,
 * under which policy version. This supports audit trails, debugging,
 * and replay.
 */
export interface PolicyDecision {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Which rule produced this decision (undefined if default) */
  rule?: string;
  /** Description of the matched rule */
  ruleDescription?: string;
  /** Suggested value (for select-model, max-timeout, etc.) */
  value?: unknown;
  /** Whether human override is possible */
  overridable: boolean;
  /** Which scope level produced this decision */
  scope: PolicyScope;
  /** Policy version that was evaluated */
  policyVersion: string;
  /** Timestamp of the decision */
  evaluatedAt: string;
}

/**
 * Hierarchical scope levels for policy evaluation.
 *
 * Precedence: task > branch > repository > organization > global
 * Higher-specificity scopes override lower ones.
 * A rule with `decision: defer` passes evaluation to the next scope.
 */
export type PolicyScope = 'global' | 'organization' | 'repository' | 'branch' | 'task';

/**
 * A single policy rule.
 *
 * Rules are evaluated in order. The first matching rule wins,
 * unless its decision is 'defer', in which case evaluation continues
 * to the next matching rule (or to the next scope layer).
 */
export interface PolicyRule {
  /** Unique rule ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** Which question types this rule applies to */
  appliesTo: PolicyQuestionType[];
  /** Condition: when does this rule match? */
  condition: PolicyCondition;
  /** Decision to return when this rule matches */
  decision: PolicyRuleDecision;
  /** Priority (higher = evaluated first) */
  priority: number;
  /** Whether this rule is enabled */
  enabled: boolean;
  /** Which scope this rule belongs to */
  scope?: PolicyScope;
}

/**
 * A condition that determines whether a rule matches.
 */
export interface PolicyCondition {
  /** Match if repository path matches this pattern */
  repository?: string;
  /** Match if branch matches this pattern */
  branch?: string;
  /** Match if file path matches this pattern */
  filePath?: string;
  /** Match if command matches this pattern */
  command?: string;
  /** Match if source equals this value */
  source?: string;
  /** Match if task has this label */
  label?: { key: string; value: string };
  /** Always match (catch-all rule) */
  always?: boolean;
}

/**
 * The decision a rule produces when it matches.
 */
export interface PolicyRuleDecision {
  /** Allow, deny, or defer to the next scope/rule */
  allowed: boolean;
  /** If true, skip this rule and continue evaluation (defer) */
  defer?: boolean;
  /** Reason */
  reason: string;
  /** Whether human can override */
  overridable: boolean;
  /** Value to return (for resource questions) */
  value?: unknown;
}

/**
 * Complete policy configuration.
 */
export interface PolicyConfig {
  /** Policy version identifier (for snapshot/audit purposes) */
  version: string;
  /** Policy rules (evaluated in priority order) */
  rules: PolicyRule[];
  /** Default decision when no rule matches */
  defaultDecision: PolicyRuleDecision;
}

/**
 * An immutable snapshot of a policy at a point in time.
 * Captured when a task starts execution for reproducibility.
 */
export interface PolicySnapshot {
  /** Policy version at capture time */
  version: string;
  /** When the snapshot was taken */
  capturedAt: string;
  /** The rules that were active */
  rules: PolicyRule[];
  /** The default decision */
  defaultDecision: PolicyRuleDecision;
}
