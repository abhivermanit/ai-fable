import { randomUUID } from 'node:crypto';
import type { MemoryStore } from './store.js';
import type {
  TaskRecord,
  ExecutionRecord,
  VerificationRecord,
  Artifact,
  ArtifactType,
  MemoryQuery,
  ExecutionStepRecord,
  VerifierOutcome,
} from './types.js';

/**
 * The Memory Service — unified facade for all memory operations.
 *
 * Provides a high-level API that the Orchestrator and other layers
 * use to record and query the system's history.
 *
 * Answers questions like:
 * - What tasks exist?
 * - What has already been attempted?
 * - What changed?
 * - What evidence exists?
 * - What is the current state?
 */
export class MemoryService {
  private readonly store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  // --- Task Lifecycle ---

  /**
   * Record a completed task.
   */
  async recordTask(task: TaskRecord): Promise<void> {
    await this.store.saveTask(task);
  }

  /**
   * Get a task record by ID.
   */
  async getTask(taskId: string): Promise<TaskRecord | undefined> {
    return this.store.getTask(taskId);
  }

  /**
   * Query task history.
   */
  async queryTasks(query: MemoryQuery): Promise<TaskRecord[]> {
    return this.store.queryTasks(query);
  }

  /**
   * Get the most recent tasks.
   */
  async recentTasks(limit: number = 10): Promise<TaskRecord[]> {
    return this.store.queryTasks({ limit, sort: 'desc' });
  }

  /**
   * Check if a similar task has been attempted before.
   */
  async hasAttempted(description: string): Promise<TaskRecord | undefined> {
    const tasks = await this.store.queryTasks({});
    return tasks.find((t) => t.description === description);
  }

  // --- Execution History ---

  /**
   * Record an execution attempt.
   */
  async recordExecution(execution: Omit<ExecutionRecord, 'id'>): Promise<string> {
    const id = randomUUID();
    await this.store.saveExecution({ ...execution, id });
    return id;
  }

  /**
   * Get all execution attempts for a task.
   */
  async getExecutionHistory(taskId: string): Promise<ExecutionRecord[]> {
    return this.store.getExecutionsForTask(taskId);
  }

  /**
   * Get the latest execution for a task.
   */
  async getLatestExecution(taskId: string): Promise<ExecutionRecord | undefined> {
    const executions = await this.store.getExecutionsForTask(taskId);
    return executions.length > 0 ? executions[executions.length - 1] : undefined;
  }

  // --- Verification History ---

  /**
   * Record a verification result.
   */
  async recordVerification(verification: Omit<VerificationRecord, 'id'>): Promise<string> {
    const id = randomUUID();
    await this.store.saveVerification({ ...verification, id });
    return id;
  }

  /**
   * Get all verifications for a task.
   */
  async getVerificationHistory(taskId: string): Promise<VerificationRecord[]> {
    return this.store.getVerificationsForTask(taskId);
  }

  /**
   * Get the latest verification for a task.
   */
  async getLatestVerification(taskId: string): Promise<VerificationRecord | undefined> {
    const verifications = await this.store.getVerificationsForTask(taskId);
    return verifications.length > 0 ? verifications[verifications.length - 1] : undefined;
  }

  // --- Artifacts ---

  /**
   * Store an artifact.
   */
  async storeArtifact(params: {
    taskId: string;
    type: ArtifactType;
    label: string;
    content: string;
    mimeType?: string;
  }): Promise<string> {
    const id = randomUUID();
    const artifact: Artifact = {
      id,
      taskId: params.taskId,
      type: params.type,
      label: params.label,
      content: params.content,
      size: Buffer.byteLength(params.content, 'utf-8'),
      createdAt: new Date().toISOString(),
      mimeType: params.mimeType ?? 'text/plain',
    };
    await this.store.saveArtifact(artifact);
    return id;
  }

  /**
   * Retrieve an artifact by ID.
   */
  async getArtifact(id: string): Promise<Artifact | undefined> {
    return this.store.getArtifact(id);
  }

  /**
   * Get all artifacts for a task.
   */
  async getTaskArtifacts(taskId: string): Promise<Artifact[]> {
    return this.store.getArtifactsForTask(taskId);
  }

  // --- Queries ---

  /**
   * Get a full task summary: record + executions + verifications + artifacts.
   */
  async getTaskSummary(taskId: string): Promise<TaskSummary | undefined> {
    const task = await this.store.getTask(taskId);
    if (!task) return undefined;

    const [executions, verifications, artifacts] = await Promise.all([
      this.store.getExecutionsForTask(taskId),
      this.store.getVerificationsForTask(taskId),
      this.store.getArtifactsForTask(taskId),
    ]);

    return { task, executions, verifications, artifacts };
  }

  /**
   * Get system-wide statistics.
   */
  async stats(): Promise<MemoryStats> {
    const tasks = await this.store.queryTasks({});
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const cancelled = tasks.filter((t) => t.status === 'cancelled').length;
    const totalRecords = await this.store.count();

    return {
      totalTasks: tasks.length,
      completedTasks: completed,
      failedTasks: failed,
      cancelledTasks: cancelled,
      totalRecords,
    };
  }

  /**
   * Clear all memory (useful for testing).
   */
  async clear(): Promise<void> {
    await this.store.clear();
  }
}

/**
 * Full summary of a task's history.
 */
export interface TaskSummary {
  task: TaskRecord;
  executions: ExecutionRecord[];
  verifications: VerificationRecord[];
  artifacts: Artifact[];
}

/**
 * System-wide memory statistics.
 */
export interface MemoryStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  totalRecords: number;
}
