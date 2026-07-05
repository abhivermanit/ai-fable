/**
 * Log levels.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Minimal structured logger for the reviewer.
 */
class Logger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.debug(`[debug] ${message}`);
    }
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(message);
    }
  }

  warn(message: string): void {
    if (this.shouldLog('warn')) {
      console.warn(`⚠️  ${message}`);
    }
  }

  error(message: string): void {
    if (this.shouldLog('error')) {
      console.error(`❌ ${message}`);
    }
  }
}

/**
 * Singleton logger instance.
 */
export const logger = new Logger();
