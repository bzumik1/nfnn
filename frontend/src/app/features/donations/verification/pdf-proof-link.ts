import { proofFragment } from './proof-link';

const PDF_HEADER = '%PDF-';
const HEADER_SEARCH = 1_024;
const URI_KEY = /\/URI\s*([(<])/g;
const OCTAL = /^[0-7]{1,3}/;
const LITERAL_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
};

export function proofFragmentInPdf(bytes: Uint8Array): string | null {
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.slice(0, HEADER_SEARCH).includes(PDF_HEADER)) {
    return null;
  }
  for (const match of text.matchAll(URI_KEY)) {
    const start = match.index + match[0].length;
    const uri = match[1] === '(' ? literalString(text, start) : hexString(text, start);
    const fragment = uri === null ? null : proofFragment(uri);
    if (fragment !== null) {
      return fragment;
    }
  }
  return null;
}

function literalString(text: string, start: number): string | null {
  let value = '';
  let depth = 1;
  let at = start;
  while (at < text.length) {
    const character = text[at];
    if (character === '\\') {
      const next = text[at + 1] ?? '';
      const octal = OCTAL.exec(text.slice(at + 1, at + 4));
      if (octal !== null) {
        value += String.fromCharCode(Number.parseInt(octal[0], 8) & 0xff);
        at += 1 + octal[0].length;
      } else if (next === '\r' || next === '\n') {
        at += next === '\r' && text[at + 2] === '\n' ? 3 : 2;
      } else {
        value += LITERAL_ESCAPES[next] ?? next;
        at += 2;
      }
      continue;
    }
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return value;
      }
    }
    value += character;
    at += 1;
  }
  return null;
}

function hexString(text: string, start: number): string | null {
  const end = text.indexOf('>', start);
  if (end < 0) {
    return null;
  }
  const hex = text.slice(start, end).replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]*$/.test(hex)) {
    return null;
  }
  const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = Array.from({ length: padded.length / 2 }, (_, index) =>
    Number.parseInt(padded.slice(2 * index, 2 * index + 2), 16),
  );
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(new Uint8Array(bytes.slice(2)));
  }
  return String.fromCharCode(...bytes);
}
