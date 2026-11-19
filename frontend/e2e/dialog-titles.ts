import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_SOURCES = join(__dirname, '..', 'src', 'app');

export const SHARED_TITLE_CLASS = 'ui-dialog__title';

const STATIC_TITLE_ID = /<app-dialog\b[^>]*?\slabelledBy="([^"]+)"/g;

const BOUND_TITLE_ID = /<app-dialog\b[^>]*?\s\[labelledBy\]=/;

const TITLE_ELEMENT = /<(h\d)\b([^>]*)>([\s\S]*?)<\/\1>/g;

const NOT_TEXT = [
  /\{\{[\s\S]*?\}\}/g,
  /<[^>]*>/g,
  /@(?:switch|case|if|else if|for)\s*\([^)]*\)\s*\{/g,
  /@(?:default|else)\s*\{/g,
  /\}/g,
];

export interface DialogTitle {
  readonly template: string;
  readonly titleClass: string;
  readonly place: 'sheet' | 'ui-offer-sheet';
  readonly texts: readonly string[];
}

function textsOf(content: string): string[] {
  const separated = NOT_TEXT.reduce((text, pattern) => text.replace(pattern, '\n'), content);
  return separated
    .replaceAll('&nbsp;', ' ')
    .split('\n')
    .map((text) => text.replace(/[ \t\r]+/g, ' ').trim())
    .filter((text) => /\p{L}{2}/u.test(text));
}

function templates(): string[] {
  return readdirSync(APP_SOURCES, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.html'))
    .sort();
}

function source(template: string): string {
  return readFileSync(join(APP_SOURCES, template), 'utf8');
}

function titlesOf(template: string): DialogTitle[] {
  const html = source(template);
  const titleIds = new Set(Array.from(html.matchAll(STATIC_TITLE_ID), (dialog) => dialog[1]));
  const place = html.includes('class="ui-offer-sheet"') ? 'ui-offer-sheet' : 'sheet';
  return Array.from(html.matchAll(TITLE_ELEMENT)).flatMap(([, , attributes, content]) => {
    const id = attributes.match(/\sid="([^"]+)"/)?.[1];
    const classes = attributes.match(/\sclass="([^"]+)"/)?.[1].split(/\s+/) ?? [];
    const shared = classes.includes(SHARED_TITLE_CLASS);
    if (!shared && (id === undefined || !titleIds.has(id))) {
      return [];
    }
    const titleClass = shared ? SHARED_TITLE_CLASS : (classes[0] ?? '');
    return [{ template, titleClass, place, texts: textsOf(content) }];
  });
}

export function everyDialogTitle(): DialogTitle[] {
  return templates().flatMap(titlesOf);
}

export function dialogsWithABoundTitle(): string[] {
  return templates().filter((template) => BOUND_TITLE_ID.test(source(template)));
}

export function titleGroup(title: DialogTitle): string {
  return title.titleClass === SHARED_TITLE_CLASS
    ? SHARED_TITLE_CLASS
    : `${title.template}#${title.titleClass}`;
}
