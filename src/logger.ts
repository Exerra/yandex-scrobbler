export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

let currentLevel: LogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (level < currentLevel) return;
  const prefix = `[${timestamp()}] [${LOG_LEVEL_NAMES[level]}]`;
  if (args.length > 0) {
    console.log(prefix, message, ...args);
  } else {
    console.log(prefix, message);
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log(LogLevel.DEBUG, msg, ...args),
  info: (msg: string, ...args: unknown[]) => log(LogLevel.INFO, msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log(LogLevel.WARN, msg, ...args),
  error: (msg: string, ...args: unknown[]) => log(LogLevel.ERROR, msg, ...args),
};
