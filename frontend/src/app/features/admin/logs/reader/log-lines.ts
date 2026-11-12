import { logSeries } from '../log-files';

export type LogFormat = 'spring' | 'leveled' | 'access' | 'plain';
export type LogLevelName = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LevelFilter = 'all' | 'warnings' | 'errors';

export interface LogLine {
  readonly offset: number;
  readonly text: string;
}

export interface LogEntry {
  readonly offset: number;
  readonly at: string | null;
  readonly level: LogLevelName | null;
  readonly thread: string | null;
  readonly logger: string | null;
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
  readonly raw: string;
}

const TIME = String.raw`(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d))`;
const LEVEL = '(TRACE|DEBUG|INFO|WARN|ERROR)';
const STARTS_WITH_TIME = new RegExp(`^${TIME}`);
const SPRING = new RegExp(
  String.raw`^${TIME}\s+${LEVEL}\s+\S+\s+---\s+\[[^\]]*\]\s+\[([^\]]*)\]\s+(\S+)\s*:\s?(.*)$`,
);
const LEVELED = new RegExp(String.raw`^${TIME}\s+${LEVEL}\s+(.*)$`);
const ACCESS = new RegExp(String.raw`^${TIME} (\S+) (\S+) (\d{3}) (.*)$`);
const PLAIN = new RegExp(String.raw`^${TIME}\s+(.*)$`);
const OFFSET_WITHOUT_COLON = /([+-]\d\d)(\d\d)$/;
const UTF8 = new TextEncoder();

const FORMATS: Readonly<Record<string, LogFormat>> = {
  'backend.log': 'spring',
  'mcp.log': 'leveled',
  'nginx-access.log': 'access',
};

const LEVEL_PATTERNS: Readonly<Record<LogFormat, Record<'warnings' | 'errors', string> | null>> = {
  spring: { warnings: String.raw`^\S+\s+(?:WARN|ERROR)\b`, errors: String.raw`^\S+\s+ERROR\b` },
  leveled: { warnings: String.raw`^\S+\s+(?:WARN|ERROR)\b`, errors: String.raw`^\S+\s+ERROR\b` },
  access: { warnings: String.raw`^\S+ \S+ \S+ [45]\d\d `, errors: String.raw`^\S+ \S+ \S+ 5\d\d ` },
  plain: null,
};

export function logFormat(fileName: string): LogFormat {
  return FORMATS[logSeries(fileName)] ?? 'plain';
}

export function levelPattern(format: LogFormat, filter: 'warnings' | 'errors'): string | null {
  return LEVEL_PATTERNS[format]?.[filter] ?? null;
}

export function linesOf(window: { readonly from: number; readonly text: string }): LogLine[] {
  const texts = window.text.split('\n');
  if (texts.at(-1) === '') {
    texts.pop();
  }
  let offset = window.from;
  return texts.map((text) => {
    const line = { offset, text };
    offset += UTF8.encode(text).length + 1;
    return line;
  });
}

export function entriesOf(lines: readonly LogLine[], format: LogFormat): LogEntry[] {
  const entries: { head: LogLine; tail: string[] }[] = [];
  for (const line of lines) {
    const current = entries.at(-1);
    if (current !== undefined && !STARTS_WITH_TIME.test(line.text)) {
      current.tail.push(line.text);
    } else {
      entries.push({ head: line, tail: [] });
    }
  }
  return entries.map(({ head, tail }) => ({
    ...parsedHead(head.text, format),
    offset: head.offset,
    details: tail,
    raw: [head.text, ...tail].join('\n'),
  }));
}

type Head = Omit<LogEntry, 'offset' | 'details' | 'raw'>;

function parsedHead(text: string, format: LogFormat): Head {
  const unknown: Head = {
    at: null,
    level: null,
    thread: null,
    logger: null,
    title: '',
    message: text,
  };
  switch (format) {
    case 'spring':
      return springHead(text) ?? plainHead(text) ?? unknown;
    case 'leveled':
      return leveledHead(text) ?? plainHead(text) ?? unknown;
    case 'access':
      return accessHead(text) ?? plainHead(text) ?? unknown;
    case 'plain':
      return plainHead(text) ?? unknown;
  }
}

function springHead(text: string): Head | null {
  const match = SPRING.exec(text);
  if (match === null) {
    return null;
  }
  const [, at, level, thread, logger, message] = match;
  return {
    at: instant(at),
    level: level as LogLevelName,
    thread,
    logger,
    title: logger.split('.').at(-1) ?? logger,
    message,
  };
}

function leveledHead(text: string): Head | null {
  const match = LEVELED.exec(text);
  if (match === null) {
    return null;
  }
  const [, at, level, message] = match;
  return {
    at: instant(at),
    level: level as LogLevelName,
    thread: null,
    logger: null,
    title: '',
    message,
  };
}

function accessHead(text: string): Head | null {
  const match = ACCESS.exec(text);
  if (match === null) {
    return null;
  }
  const [, at, method, path, status, rest] = match;
  const timings = rest.split(' ');
  const sized = timings.length >= 3;
  const facts = [status, ...(sized ? [`${timings[0]} B`] : []), `${timings[sized ? 1 : 0]} s`];
  return {
    at: instant(at),
    level: status.startsWith('5') ? 'ERROR' : status.startsWith('4') ? 'WARN' : 'INFO',
    thread: null,
    logger: null,
    title: `${method} ${path}`,
    message: facts.join(' · '),
  };
}

function plainHead(text: string): Head | null {
  const match = PLAIN.exec(text);
  if (match === null) {
    return null;
  }
  const [, at, message] = match;
  return { at: instant(at), level: null, thread: null, logger: null, title: '', message };
}

function instant(written: string): string {
  return written.replace(OFFSET_WITHOUT_COLON, '$1:$2');
}
