import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_SOURCES = join(__dirname, '..', 'src', 'app');

const DIALOG_TITLE = /<(h\d)\b[^>]*\bclass="[^"]*\bui-dialog__title\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;

const NOT_TEXT = [
  /\{\{[\s\S]*?\}\}/g,
  /<[^>]*>/g,
  /@(?:switch|case|if|else if|for)\s*\([^)]*\)\s*\{/g,
  /@(?:default|else)\s*\{/g,
  /\}/g,
];

function textsOf(content: string): string[] {
  const separated = NOT_TEXT.reduce((text, pattern) => text.replace(pattern, '\n'), content);
  return separated
    .replaceAll('&nbsp;', '\u00a0')
    .split('\n')
    .map((text) => text.replace(/[ \t\r]+/g, ' ').trim())
    .filter((text) => /\p{L}{2}/u.test(text));
}

export function everyDialogTitleText(): string[] {
  const templates = readdirSync(APP_SOURCES, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.html'),
  );
  const titles = templates.flatMap((file) =>
    Array.from(readFileSync(join(APP_SOURCES, file), 'utf8').matchAll(DIALOG_TITLE)).flatMap(
      (title) => textsOf(title[2]),
    ),
  );
  return [...new Set(titles)].sort();
}
