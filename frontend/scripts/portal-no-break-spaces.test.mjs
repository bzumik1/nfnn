import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const APP = new URL('../src/app/', import.meta.url).pathname;
const PORTAL = ['features/donors/dashboard', 'layout/account-sheet'];

const NOT_SHOWN = {
  'donor.bankAccounts.hint.warningPrefix': 'visually hidden prefix of a hint',
};

const BREAKS = [
  { rule: 'one-letter word', pattern: /(?:^|[\s(„“‚])[ksvzouaiKSVZOUAI][ \t\r\n]+(?=\S)/ },
  {
    rule: 'number and its unit',
    pattern:
      /(?:^|[^\d.,:])\d+[ \t\r\n]+(?=(?:Kč|%|znak|dn[ií]|den\b|hodin|sekund|minut|zaříz|číslic|platb|plateb|týd|měsíc)[^\s]*)/,
  },
  { rule: 'IČO and its number', pattern: /IČO[ \t\r\n]+(?=\d)/ },
];

function decode(text) {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&ngsp;', ' ')
    .replaceAll('&#8209;', '‑')
    .replaceAll('&amp;', '&');
}

export function shownTexts(template) {
  const texts = [];
  const withoutHidden = template
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\w+)\b[^>]*\bclass="[^"]*\bvisually-hidden\b[^"]*"[^>]*>[\s\S]*?<\/\1\s*>/g, '\n');
  for (const field of withoutHidden.matchAll(/<app-form-field\b[^>]*>/g)) {
    for (const attribute of field[0].matchAll(/\s(label|hint)="([^"]*)"/g)) {
      texts.push(decode(attribute[2]));
    }
  }
  const body = withoutHidden
    .replace(/\{\{[\s\S]*?\}\}/g, 'X')
    .replace(/<[^>]*>/g, '')
    .replace(/@\w+\b[^{\n]*\{/g, '\n')
    .replace(/\{[^,{}]+,\s*(?:plural|select),/g, '\n')
    .replace(/(?:^|\s)(?:one|few|many|other|=\d+)\s*\{/g, '\n')
    .replace(/[{}]/g, '\n');
  texts.push(decode(body));
  return texts;
}

export function localizedTexts(source) {
  const texts = [];
  for (const message of source.matchAll(/\$localize`:@@([^:]+):((?:[^`\\]|\\.)*)`/g)) {
    if (message[1] in NOT_SHOWN) continue;
    const text = message[2]
      .replace(/\$\{[^}]*\}:count:/g, '9')
      .replace(/\$\{[^}]*\}:\w+:/g, 'X')
      .replaceAll('\\u00a0', ' ');
    texts.push(text);
  }
  return texts;
}

export function breaksIn(text) {
  return BREAKS.flatMap(({ rule, pattern }) =>
    [...text.matchAll(new RegExp(pattern.source, 'g'))].map(
      ({ index }) =>
        `${rule}: …${text.slice(Math.max(0, index - 20), index + 30).replace(/\s+/g, ' ')}…`,
    ),
  );
}

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

function portalFindings() {
  return PORTAL.flatMap((folder) => files(join(APP, folder))).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const texts = path.endsWith('.html') ? shownTexts(source) : localizedTexts(source);
    return texts.flatMap(breaksIn).map((finding) => `${relative(APP, path)}: ${finding}`);
  });
}

describe('Given the texts the donor portal shows', () => {
  it('when they are read, then no line breaks after a one-letter word, inside 1 Kč, IČO or a number with its unit', () => {
    assert.deepEqual(portalFindings(), []);
  });

  it('when a template puts an ordinary space after a one-letter word, then it is reported', () => {
    const [text] = shownTexts('<p i18n="@@donor.x">Platby z účtu</p>');

    assert.equal(breaksIn(text).length, 1);
  });

  it('when a template keeps the word with the next one by a no-break space, then nothing is reported', () => {
    const [text] = shownTexts('<p i18n="@@donor.x">Platby z&nbsp;účtu, pošlete 1&nbsp;Kč.</p>');

    assert.deepEqual(breaksIn(text), []);
  });

  it('when the ordinary space is in a visually hidden text, an attribute or an interpolation, then nothing is reported', () => {
    const texts = shownTexts(
      '<span class="visually-hidden">dar z účtu</span><a aria-label="z účtu" href="mailto:a@b.cz">{{ a ? "v x" : "" }}</a>',
    );

    assert.deepEqual(texts.flatMap(breaksIn), []);
  });

  it('when a field label shows an ordinary space after a one-letter word, then it is reported', () => {
    const texts = shownTexts('<app-form-field label="Kód z aplikace" i18n-label="@@donor.x">');

    assert.equal(texts.flatMap(breaksIn).length, 1);
  });

  it('when a localized text has an ordinary space inside 1 Kč or after a count, then both are reported', () => {
    const texts = localizedTexts(
      'a = $localize`:@@donor.x:Pošlete 1 Kč.`; b = $localize`:@@donor.y:Máte ${count}:count: platby.`;',
    );

    assert.equal(texts.flatMap(breaksIn).length, 2);
  });

  it('when a localized text keeps them together with \\u00a0, then nothing is reported', () => {
    const texts = localizedTexts('a = $localize`:@@donor.x:Pošlete 1\\u00a0Kč z\\u00a0účtu.`;');

    assert.deepEqual(texts.flatMap(breaksIn), []);
  });
});
