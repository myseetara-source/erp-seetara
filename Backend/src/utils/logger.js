/**
 * Logger Utility
 * Structured logging for the ERP system
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[90m', // Gray
  reset: '\x1b[0m',
};

class Logger {
  constructor(context = 'APP') {
    this.context = context;
    this.level = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;
  }

  /**
   * Format log message with timestamp and context
   */
  _format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level] || '';
    const reset = COLORS.reset;
    
    const metaStr = Object.keys(meta).length 
      ? ` ${JSON.stringify(meta)}` 
      : '';

    return `${color}[${timestamp}] [${level.toUpperCase()}] [${this.context}]${reset} ${message}${metaStr}`;
  }

  /**
   * Log error messages
   */
  error(message, meta = {}) {
    if (this.level >= LOG_LEVELS.error) {
      console.error(this._format('error', message, meta));
      
      // In production, you might want to send to external service
      if (meta.error instanceof Error) {
        console.error(meta.error.stack);
      }
    }
  }

  /**
   * Log warning messages
   */
  warn(message, meta = {}) {
    if (this.level >= LOG_LEVELS.warn) {
      console.warn(this._format('warn', message, meta));
    }
  }

  /**
   * Log info messages
   */
  info(message, meta = {}) {
    if (this.level >= LOG_LEVELS.info) {
      console.log(this._format('info', message, meta));
    }
  }

  /**
   * Log debug messages
   */
  debug(message, meta = {}) {
    if (this.level >= LOG_LEVELS.debug) {
      console.log(this._format('debug', message, meta));
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context) {
    return new Logger(`${this.context}:${context}`);
  }
}

// Default logger instance
const logger = new Logger();

// Named exports for specific contexts
export const createLogger = (context) => new Logger(context);
export default logger;
