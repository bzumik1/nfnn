import { appendFileSync } from 'node:fs';
import type { Logger } from './token-exchange.js';

export interface LoggerOptions {
  readonly file?: string;
  readonly console: (line: string) => void;
  readonly now?: () => Date;
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const write = (level: string, message: string) => {
    const line = `${now().toISOString()} ${level} ${oneLine(message)}`;
    options.console(line);
    if (options.file) {
      try {
        appendFileSync(options.file, `${line}\n`);
      } catch {
        return;
      }
    }
  };
  return {
    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
  };
}

function oneLine(message: string): string {
  return message.replaceAll('\r', '\\r').replaceAll('\n', '\\n');
}
