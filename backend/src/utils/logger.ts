type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  timestamp: string;
}

class Logger {
  private formatLog(level: LogLevel, message: string, context?: string, data?: unknown): LogPayload {
    return {
      timestamp: new Date().toISOString(),
      level,
      context: context || 'Application',
      message,
      ...(data !== undefined ? { data } : {}),
    };
  }

  private print(level: LogLevel, message: string, context?: string, data?: unknown): void {
    const log = this.formatLog(level, message, context, data);
    const prefix = `[${log.timestamp}] [${level.toUpperCase()}] [${log.context}]:`;

    switch (level) {
      case 'error':
        console.error(prefix, message, data !== undefined ? data : '');
        break;
      case 'warn':
        console.warn(prefix, message, data !== undefined ? data : '');
        break;
      case 'debug':
        if (process.env.NODE_ENV !== 'production') {
          console.debug(prefix, message, data !== undefined ? data : '');
        }
        break;
      case 'info':
      default:
        console.log(prefix, message, data !== undefined ? data : '');
        break;
    }
  }

  info(message: string, context?: string, data?: unknown): void {
    this.print('info', message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.print('warn', message, context, data);
  }

  error(message: string, context?: string, data?: unknown): void {
    this.print('error', message, context, data);
  }

  debug(message: string, context?: string, data?: unknown): void {
    this.print('debug', message, context, data);
  }
}

export const logger = new Logger();
