import fs from 'fs';
import path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'HTTP' | 'DEBUG';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  meta?: any;
}

const LOGS_DIR = path.join(process.cwd(), 'logs');
const APP_LOG_FILE = path.join(LOGS_DIR, 'foms.log');
const ERROR_LOG_FILE = path.join(LOGS_DIR, 'error.log');
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per log file

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error('[Logger Init Error] Could not create logs directory:', err);
  }
}

// In-memory circular buffer for fast real-time UI viewing in Admin Portal
const IN_MEMORY_LOG_LIMIT = 200;
const inMemoryLogs: LogEntry[] = [];

function rotateIfNeeded(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const backupPath = `${filePath}.${Date.now()}.bak`;
        fs.renameSync(filePath, backupPath);
      }
    }
  } catch {}
}

function writeToFile(filePath: string, line: string) {
  try {
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, line + '\n', 'utf-8');
  } catch (err) {
    // If disk write fails, at least fail quietly to console
    console.error('[Logger Write Error]', err);
  }
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').replace('Z', '');
}

function safeConsole(type: 'log' | 'warn' | 'error', message: string) {
  try {
    console[type](message);
  } catch {}
}

class Logger {
  private formatLog(level: LogLevel, tag: string, message: string, meta?: any): { formatted: string; entry: LogEntry } {
    const ts = formatTimestamp();
    const metaStr = meta ? ` | Meta: ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : '';
    const formatted = `[${ts}] [${level.padEnd(5)}] [${tag}] ${message}${metaStr}`;
    const entry: LogEntry = {
      timestamp: ts,
      level,
      tag,
      message,
      meta,
    };
    return { formatted, entry };
  }

  private pushInMemory(entry: LogEntry) {
    inMemoryLogs.unshift(entry);
    if (inMemoryLogs.length > IN_MEMORY_LOG_LIMIT) {
      inMemoryLogs.pop();
    }
  }

  info(tag: string, message: string, meta?: any) {
    const { formatted, entry } = this.formatLog('INFO', tag, message, meta);
    safeConsole('log', formatted);
    writeToFile(APP_LOG_FILE, formatted);
    this.pushInMemory(entry);
  }

  warn(tag: string, message: string, meta?: any) {
    const { formatted, entry } = this.formatLog('WARN', tag, message, meta);
    safeConsole('warn', formatted);
    writeToFile(APP_LOG_FILE, formatted);
    this.pushInMemory(entry);
  }

  error(tag: string, message: string, error?: any, meta?: any) {
    let errDetail = '';
    if (error instanceof Error) {
      errDetail = `\nStack: ${error.stack}`;
    } else if (error) {
      errDetail = ` | Error: ${typeof error === 'object' ? JSON.stringify(error) : error}`;
    }

    const { formatted, entry } = this.formatLog('ERROR', tag, message + errDetail, meta);
    safeConsole('error', formatted);
    writeToFile(APP_LOG_FILE, formatted);
    writeToFile(ERROR_LOG_FILE, formatted);
    this.pushInMemory(entry);
  }

  http(method: string, url: string, status: number, durationMs: number, ip: string, extra?: string) {
    const level: LogLevel = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'HTTP';
    const slowTag = durationMs > 1000 ? ' [SLOW REQUEST]' : '';
    const message = `${method} ${url} ${status} - ${durationMs}ms [IP: ${ip}]${slowTag}${extra ? ` (${extra})` : ''}`;
    const { formatted, entry } = this.formatLog(level, 'HTTP', message);

    if (level === 'ERROR') {
      safeConsole('error', formatted);
      writeToFile(ERROR_LOG_FILE, formatted);
    } else if (level === 'WARN') {
      safeConsole('warn', formatted);
    } else if (durationMs > 1000 || process.env.VERBOSE_CONSOLE === 'true') {
      // Print slow requests or when explicitly enabled to console to prevent Windows CMD stdout blocking
      safeConsole('log', formatted);
    }
    writeToFile(APP_LOG_FILE, formatted);
    this.pushInMemory(entry);
  }

  debug(tag: string, message: string, meta?: any) {
    if (process.env.DEBUG === 'true') {
      const { formatted, entry } = this.formatLog('DEBUG', tag, message, meta);
      console.log(formatted);
      writeToFile(APP_LOG_FILE, formatted);
      this.pushInMemory(entry);
    }
  }

  getRecentLogs(limit = 100, level?: LogLevel): LogEntry[] {
    if (!level) {
      return inMemoryLogs.slice(0, limit);
    }
    return inMemoryLogs.filter((l) => l.level === level).slice(0, limit);
  }

  getLogFilePath(type: 'app' | 'error' = 'app'): string {
    return type === 'error' ? ERROR_LOG_FILE : APP_LOG_FILE;
  }
}

export const logger = new Logger();
