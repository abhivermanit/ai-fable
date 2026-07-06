import type { MemoryStore } from './store.js';
import type {
  TaskRecord,
  ExecutionRecord,
  VerificationRecord,
  Artifact,
  MemoryQuery,
} from './types.js';

/**
 * In-memory implementation of the MemoryStore.
 *
 * Suitable for testing, development, and single-session use.
 * Data is lost on process exit.
 *
 * A file-based or database-backed implementation can replace
 * this for persistence across sessions.
 */
export class InMemoryStore implements MemoryStore {
  private tasks = new Map<string, TaskRecord>();
  private executions = new Map<string, ExecutionRecord>();
  private verifications = new Map<string, VerificationRecord>();
  private artifacts = new Map<string, Artifact>();

  // --- Task Records ---

  async saveTask(record: TaskRecord): Promise<void> {
    this.tasks.set(record.id, structuredClone(record));
  }

  async getTask(id: string): Promise<TaskRecord | undefined> {
    const record = this.tasks.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async queryTasks(query: MemoryQuery): Promise<TaskRecord[]> {
    let results = [...this.tasks.values()];

    if (query.taskId) {
      results = results.filter((r) => r.id === query.taskId);
    }
    if (query.status) {
      results = results.filter((r) => r.status === query.status);
    }
    if (query.source) {
      results = results.filter((r) => r.source === query.source);
    }
    if (query.label) {
      const { key, value } = query.label;
      results = results.filter((r) => r.labels[key] === value);
    }
    if (query.after) {
      results = results.filter((r) => r.createdAt >= query.after!);
    }
    if (query.before) {
      results = results.filter((r) => r.createdAt <= query.before!);
    }

    // Sort
    const sortOrder = query.sort ?? 'desc';
    results.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results.map((r) => structuredClone(r));
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  // --- Execution Records ---

  async saveExecution(record: ExecutionRecord): Promise<void> {
    this.executions.set(record.id, structuredClone(record));
  }

  async getExecution(id: string): Promise<ExecutionRecord | undefined> {
    const record = this.executions.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async getExecutionsForTask(taskId: string): Promise<ExecutionRecord[]> {
    return [...this.executions.values()]
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => a.attempt - b.attempt)
      .map((r) => structuredClone(r));
  }

  // --- Verification Records ---

  async saveVerification(record: VerificationRecord): Promise<void> {
    this.verifications.set(record.id, structuredClone(record));
  }

  async getVerification(id: string): Promise<VerificationRecord | undefined> {
    const record = this.verifications.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async getVerificationsForTask(taskId: string): Promise<VerificationRecord[]> {
    return [...this.verifications.values()]
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((r) => structuredClone(r));
  }

  // --- Artifacts ---

  async saveArtifact(artifact: Artifact): Promise<void> {
    this.artifacts.set(artifact.id, structuredClone(artifact));
  }

  async getArtifact(id: string): Promise<Artifact | undefined> {
    const record = this.artifacts.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async getArtifactsForTask(taskId: string): Promise<Artifact[]> {
    return [...this.artifacts.values()]
      .filter((a) => a.taskId === taskId)
      .map((a) => structuredClone(a));
  }

  async deleteArtifact(id: string): Promise<boolean> {
    return this.artifacts.delete(id);
  }

  // --- Lifecycle ---

  async clear(): Promise<void> {
    this.tasks.clear();
    this.executions.clear();
    this.verifications.clear();
    this.artifacts.clear();
  }

  async count(): Promise<number> {
    return this.tasks.size + this.executions.size + this.verifications.size + this.artifacts.size;
  }
}
