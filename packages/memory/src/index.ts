// Types
export type {
  TaskRecord,
  ExecutionRecord,
  ExecutionStepRecord,
  VerificationRecord,
  VerifierOutcome,
  Artifact,
  ArtifactType,
  MemoryQuery,
} from './types.js';

// Store interface
export type { MemoryStore } from './store.js';

// In-memory implementation
export { InMemoryStore } from './in-memory-store.js';

// Memory Service (unified facade)
export { MemoryService } from './memory-service.js';
export type { TaskSummary, MemoryStats } from './memory-service.js';
