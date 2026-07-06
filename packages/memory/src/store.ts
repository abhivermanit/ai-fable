import type {
  TaskRecord,
  ExecutionRecord,
  VerificationRecord,
  Artifact,
  MemoryQuery,
} from './types.js';

/**
 * Persistence abstraction for the Memory Layer.
 *
 * Implementations can be in-memory (testing/development),
 * file-based (single-user), or database-backed (production).
 *
 * All operations are async to support network-backed stores.
 */
export interface MemoryStore {
  // --- Task Records ---
  saveTask(record: TaskRecord): Promise<void>;
  getTask(id: string): Promise<TaskRecord | undefined>;
  queryTasks(query: MemoryQuery): Promise<TaskRecord[]>;
  deleteTask(id: string): Promise<boolean>;

  // --- Execution Records ---
  saveExecution(record: ExecutionRecord): Promise<void>;
  getExecution(id: string): Promise<ExecutionRecord | undefined>;
  getExecutionsForTask(taskId: string): Promise<ExecutionRecord[]>;

  // --- Verification Records ---
  saveVerification(record: VerificationRecord): Promise<void>;
  getVerification(id: string): Promise<VerificationRecord | undefined>;
  getVerificationsForTask(taskId: string): Promise<VerificationRecord[]>;

  // --- Artifacts ---
  saveArtifact(artifact: Artifact): Promise<void>;
  getArtifact(id: string): Promise<Artifact | undefined>;
  getArtifactsForTask(taskId: string): Promise<Artifact[]>;
  deleteArtifact(id: string): Promise<boolean>;

  // --- Lifecycle ---
  /** Clear all stored data (useful for testing) */
  clear(): Promise<void>;
  /** Get total record count across all types */
  count(): Promise<number>;
}
