/**
 * Base error for all reviewer errors.
 */
export class ReviewerError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ReviewerError';
    this.code = code;
  }
}

/**
 * Git is not installed or not found in PATH.
 */
export class GitNotFoundError extends ReviewerError {
  constructor() {
    super(
      'Git is not installed or not found in PATH. Install Git and try again.',
      'GIT_NOT_FOUND',
    );
    this.name = 'GitNotFoundError';
  }
}

/**
 * The current directory is not inside a Git repository.
 */
export class NotARepositoryError extends ReviewerError {
  constructor(cwd: string) {
    super(
      `Not a Git repository: ${cwd}`,
      'NOT_A_REPOSITORY',
    );
    this.name = 'NotARepositoryError';
  }
}

/**
 * The diff is empty (no changes to review).
 */
export class EmptyDiffError extends ReviewerError {
  constructor(mode: string) {
    super(
      `No changes detected in ${mode} mode. Stage files or use --all.`,
      'EMPTY_DIFF',
    );
    this.name = 'EmptyDiffError';
  }
}

/**
 * The diff exceeds the configured size limit.
 */
export class DiffTooLargeError extends ReviewerError {
  constructor(size: number, limit: number) {
    super(
      `Diff is too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum allowed: ${(limit / 1024 / 1024).toFixed(1)} MB.`,
      'DIFF_TOO_LARGE',
    );
    this.name = 'DiffTooLargeError';
  }
}

/**
 * File system permission denied.
 */
export class PermissionDeniedError extends ReviewerError {
  constructor(path: string) {
    super(
      `Permission denied: ${path}`,
      'PERMISSION_DENIED',
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Invalid CLI argument.
 */
export class InvalidArgumentError extends ReviewerError {
  constructor(argument: string, reason: string) {
    super(
      `Invalid argument '${argument}': ${reason}`,
      'INVALID_ARGUMENT',
    );
    this.name = 'InvalidArgumentError';
  }
}
