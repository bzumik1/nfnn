export interface MessageSegment {
  readonly kind: 'text' | 'code';
  readonly text: string;
  readonly lead: string;
  readonly trail: string;
}

export interface StackFrame {
  readonly packageName: string;
  readonly method: string;
  readonly place: string;
  readonly rest: string;
}

export interface LoggedException {
  readonly packageName: string;
  readonly name: string;
  readonly message: string;
  readonly frames: readonly string[];
}

const CODE_PARTS = [
  String.raw`\b[\w-]+(?:\.[\w-]+)*\.(?:age|gz|log|json|txt|dump|sql|pdf|jar|java)\b`,
  String.raw`https?:\/\/[^\s()<>"']*[^\s()<>"'.,;:!?]`,
  String.raw`\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?`,
  String.raw`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b`,
  String.raw`\b\d{4}-\d\d-\d\d(?:\/\d{4}-\d\d-\d\d)?\b`,
  String.raw`\b\d+-\d+\b`,
  String.raw`\b[\w.-]+=[^\s,;()]+`,
  String.raw`\b(?:[a-z_$][\w$]*\.)+[A-Za-z_$][\w$]*(?:@[0-9a-f]+)?`,
  String.raw`\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b`,
  String.raw`\b[A-Z]{5,}\b`,
  String.raw`\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+(?:-\d+)?\b`,
  String.raw`\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b`,
  String.raw`\bHTTPS? \d{3}\b`,
  String.raw`\b\d+(?:\.\d+)?(?:ms|s|µs|ns|kB|MB|B)(?!\w)`,
  String.raw`\b[a-z][\w-]*(?:\/[\w.-]+)+`,
];
const CODE = new RegExp(CODE_PARTS.map((part) => `(?:${part})`).join('|'), 'g');
const LEAD = /[([{"'«„]+$/;
const TRAIL = /^[)\]}"'»“.,;:!?]+/;
const FRAME = /^at\s+((?:[\w$]+\.)*)([\w$]+\.[\w$<>]+)(\([^)]*\))\s*(.*)$/;
const EXCEPTION_HEAD = /^(?:Caused by: )?((?:[a-z_$][\w$]*\.)+)([A-Z][\w$]*)(?::\s?(.*))?$/;

export function segmentsOf(message: string): MessageSegment[] {
  const segments: { kind: 'text' | 'code'; text: string; lead: string; trail: string }[] = [];
  let at = 0;
  for (const match of message.matchAll(CODE)) {
    if (match.index > at) {
      segments.push({ kind: 'text', text: message.slice(at, match.index), lead: '', trail: '' });
    }
    segments.push({ kind: 'code', text: match[0], lead: '', trail: '' });
    at = match.index + match[0].length;
  }
  if (at < message.length) {
    segments.push({ kind: 'text', text: message.slice(at), lead: '', trail: '' });
  }
  segments.forEach((segment, index) => {
    if (segment.kind !== 'code') {
      return;
    }
    const before = segments[index - 1];
    const after = segments[index + 1];
    const lead = before?.kind === 'text' ? LEAD.exec(before.text) : null;
    if (before !== undefined && lead !== null) {
      segment.lead = lead[0];
      before.text = before.text.slice(0, -lead[0].length);
    }
    const trail = after?.kind === 'text' ? TRAIL.exec(after.text) : null;
    if (after !== undefined && trail !== null) {
      segment.trail = trail[0];
      after.text = after.text.slice(trail[0].length);
    }
  });
  return segments.filter((segment) => segment.kind === 'code' || segment.text !== '');
}

export function exceptionOf(details: readonly string[]): LoggedException | null {
  const lines = details.map((line) => line.trim()).filter((line) => line !== '');
  const head = lines.length === 0 ? null : EXCEPTION_HEAD.exec(lines[0]);
  if (head === null) {
    return null;
  }
  const [, packageName, name, message] = head;
  return { packageName, name, message: message ?? '', frames: lines.slice(1) };
}

export function frameOf(line: string): StackFrame | null {
  const frame = FRAME.exec(line.trim());
  if (frame === null) {
    return null;
  }
  const [, packageName, method, place, rest] = frame;
  return { packageName, method, place, rest };
}
