import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const APP = new URL('../src/app/', import.meta.url).pathname;
const { longestWordKeptWithAOneLetterWord: LONGEST_KEPT_WORD } = JSON.parse(
  readFileSync(new URL('./one-letter-word-limit.json', import.meta.url), 'utf8'),
);
const NOT_CHECKED = {
  'donor.bankAccounts.hint.warningPrefix': 'visually hidden prefix of a hint',
  'content.detail.siteName': 'part of the browser tab title, which never wraps',
};

const NOT_CHECKED_KINDS = [
  { ids: /\.pageTitle(?:\.|$)/, reason: 'the browser tab title, which never wraps' },
  { ids: /^operations\.backupKey\.file\./, reason: 'a line of the downloaded key file' },
  {
    ids: /\.pdf\./,
    reason: 'drawn into the receipt PDF or its metadata, which changes only with a look sheet',
  },
];

const SPOKEN_BINDING =
  /\[(?:attr\.)?(?:aria-[\w-]+|title|alt|ariaLabel)\]="([^"]+)"|<app-qr-code\b[^>]*?\[label\]="([^"]+)"/g;

function definitionOf(source, name) {
  const property = new RegExp(
    `\\n  (?:(?:protected|private|public|readonly) )*${name}\\b[^\\n=(]*=`,
  ).exec(source);
  const method = new RegExp(
    `\\n  (?:(?:protected|private|public) )*${name}\\([^)]*\\)[^{\\n]*\\{`,
  ).exec(source);
  const found = property ?? method;
  if (!found) {
    return '';
  }
  const rest = source.slice(found.index + found[0].length);
  const end = rest.search(/\n  (?:[}@]|(?:protected|private|public|readonly) |\w+\()/);
  return rest.slice(0, end < 0 ? undefined : end);
}

export function spokenIds(template, component) {
  const ids = new Set();
  for (const binding of template.matchAll(SPOKEN_BINDING)) {
    const name = /^\s*([A-Za-z_$][\w$]*)\s*(?:\(.*\))?\s*$/.exec(binding[1] ?? binding[2])?.[1];
    if (!name) {
      continue;
    }
    for (const message of definitionOf(component, name).matchAll(/\$localize`:@@([^:]+):/g)) {
      ids.add(message[1]);
    }
  }
  for (const attribute of template.matchAll(/\si18n-(aria-[\w-]+|title|alt)="@@([^"]+)"/g)) {
    ids.add(attribute[2]);
  }
  return ids;
}

function spokenTexts() {
  const ids = new Set();
  for (const path of files(APP).filter((file) => file.endsWith('.html'))) {
    const componentPath = path.replace(/\.html$/, '.ts');
    let component = '';
    try {
      component = readFileSync(componentPath, 'utf8');
    } catch {
      component = '';
    }
    for (const id of spokenIds(readFileSync(path, 'utf8'), component)) {
      ids.add(id);
    }
  }
  return ids;
}

const SPOKEN = spokenTexts();

function notChecked(id) {
  return id in NOT_CHECKED || SPOKEN.has(id) || NOT_CHECKED_KINDS.some(({ ids }) => ids.test(id));
}

const BREAKS = [
  {
    rule: 'number and its unit',
    pattern:
      /(?:^|[^\d.,:])\d+[ \t\r\n]+(?=(?:Kč|%|znak|dn[ií]|den\b|hodin|sekund|minut|zaříz|číslic|platb|plateb|týd|měsíc)[^\s]*)/,
  },
  { rule: 'IČO and its number', pattern: /IČO[ \t\r\n]+(?=\d)/ },
  { rule: 'dash and the word before it', pattern: /\p{L}{2,}[ \t\r\n]+(?=–)/u },
];

const ONE_LETTER_WORD = /(?<=^|[\s(„“‚])[ksvzouaiKSVZOUAI]([ \t\r\n\u00a0]+)(?=(\S+))/gu;

function decode(text) {
  return text
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll('&ngsp;', ' ')
    .replaceAll('&#8209;', '\u2011')
    .replaceAll('&amp;', '&');
}

export function shownTexts(template) {
  const texts = [];
  const withoutHidden = template
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/strong>(?:\s|&nbsp;)+–/g, '</strong>\u2063–')
    .replace(/<(\w+)\b[^>]*\bclass="[^"]*\bvisually-hidden\b[^"]*"[^>]*>[\s\S]*?<\/\1\s*>/g, '\n')
    .replace(/<(\w+)\b[^>]*\si18n="@@([^"]+)"[^>]*>[\s\S]*?<\/\1\s*>/g, (element, _tag, id) =>
      notChecked(id) ? '\n' : element,
    );
  for (const field of withoutHidden.matchAll(/<app-form-field\b[^>]*>/g)) {
    for (const attribute of field[0].matchAll(/\s(label|hint)="([^"]*)"/g)) {
      const id = new RegExp(`i18n-${attribute[1]}="@@([^"]+)"`).exec(field[0])?.[1];
      if (id === undefined || !notChecked(id)) texts.push(decode(attribute[2]));
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
    if (notChecked(message[1])) continue;
    const text = message[2]
      .replace(/\$\{[^}]*\}:count:/g, '9')
      .replace(/\$\{[^}]*\}:\w+:/g, 'X')
      .replaceAll('\\u00a0', '\u00a0');
    texts.push(text);
  }
  return texts;
}

function around(text, index) {
  return `…${text.slice(Math.max(0, index - 20), index + 30).replace(/\s+/g, ' ')}…`;
}

function oneLetterWordBreaks(text) {
  return [...text.matchAll(ONE_LETTER_WORD)].flatMap(({ index, 1: space, 2: word }) =>
    word.replace(/[^\p{L}\p{N}]/gu, '').length <= LONGEST_KEPT_WORD && space !== '\u00a0'
      ? [`one-letter word: ${around(text, index)}`]
      : [],
  );
}

export function breaksIn(text) {
  return [
    ...oneLetterWordBreaks(text),
    ...BREAKS.flatMap(({ rule, pattern }) =>
      [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))].map(
        ({ index }) => `${rule}: ${around(text, index)}`,
      ),
    ),
  ];
}

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

function siteFindings() {
  return files(APP).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const texts = path.endsWith('.html') ? shownTexts(source) : localizedTexts(source);
    return texts.flatMap(breaksIn).map((finding) => `${relative(APP, path)}: ${finding}`);
  });
}

function spokenFindings() {
  const findings = [];
  for (const path of files(APP)) {
    const source = readFileSync(path, 'utf8');
    for (const attribute of source.matchAll(/\s(?:aria-[\w-]+|title|alt)="([^"]*)"/g)) {
      if (/&nbsp;|\u00a0/.test(attribute[1])) {
        findings.push(`${relative(APP, path)}: ${attribute[0].trim()}`);
      }
    }
    for (const message of source.matchAll(/\$localize`:@@([^:]+):((?:[^`\\]|\\.)*)`/g)) {
      if (SPOKEN.has(message[1]) && /\\u00a0|\u00a0/.test(message[2])) {
        findings.push(
          `${relative(APP, path)}: @@${message[1]} is read out by assistive technology`,
        );
      }
    }
  }
  return findings;
}

describe('Given the texts read out only by assistive technology', () => {
  it('when an aria attribute, a title or an alt text is read, then it holds no no-break space', () => {
    assert.deepEqual(spokenFindings(), []);
  });

  it('when a template binds an aria label to a localized property, then its id is found', () => {
    const ids = spokenIds(
      '<app-qr-code [label]="qrLabel" /><button [attr.aria-label]="removeLabel(item)">',
      '\n  protected readonly qrLabel = $localize`:@@donor.qr:QR platba`;\n  removeLabel(item: Item): string {\n    return $localize`:@@donor.remove:Odebrat ${item}:item:`;\n  }\n',
    );

    assert.deepEqual([...ids].sort(), ['donor.qr', 'donor.remove']);
  });
});

describe('Given the texts the site shows', () => {
  it(`when they are read, then a one-letter word keeps a word of at most ${LONGEST_KEPT_WORD} letters by a no-break space, and no line breaks before a dash, inside 1 Kč, IČO or a number with its unit`, () => {
    assert.deepEqual(siteFindings(), []);
  });

  it('when a browser tab title or a text of the receipt PDF has an ordinary space, then it is not reported', () => {
    const texts = localizedTexts(
      'a = $localize`:@@donor.x.pageTitle:Platby z účtu`; b = $localize`:@@donor.receipt.pdf.x:Kód z potvrzení`;',
    );

    assert.deepEqual(texts.flatMap(breaksIn), []);
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
    const texts = shownTexts('<app-form-field label="Platba z účtu" i18n-label="@@donor.x">');

    assert.equal(texts.flatMap(breaksIn).length, 1);
  });

  it('when a one-letter word stands before a word longer than the limit, then either space is accepted', () => {
    const [kept] = shownTexts('<p i18n="@@donor.x">Platby z&nbsp;nejrůznějších účtů</p>');
    const [free] = shownTexts('<p i18n="@@donor.x">Platby z nejrůznějších účtů</p>');

    assert.deepEqual(breaksIn(kept), []);
    assert.deepEqual(breaksIn(free), []);
  });

  it('when one-letter words follow each other, then each keeps the next word by a no-break space', () => {
    const [chained] = shownTexts('<p i18n="@@donor.x">Údaje a&nbsp;k&nbsp;nim</p>');
    const [broken] = shownTexts('<p i18n="@@donor.x">Údaje a&nbsp;k nim</p>');

    assert.deepEqual(breaksIn(chained), []);
    assert.equal(breaksIn(broken).length, 1);
  });

  it('when a dash follows a bold name, then it may start the next line', () => {
    const [text] = shownTexts(
      '<li i18n="@@donor.x"><strong>Právo na přístup</strong> – můžete</li>',
    );

    assert.deepEqual(breaksIn(text), []);
  });

  it('when a word stands before a dash with an ordinary space, then it is reported, and with a no-break space it is not', () => {
    const [broken] = shownTexts('<p i18n="@@donor.x">Sídlo – ulice</p>');
    const [kept] = shownTexts('<p i18n="@@donor.x">Sídlo&nbsp;– ulice</p>');

    assert.equal(breaksIn(broken).length, 1);
    assert.deepEqual(breaksIn(kept), []);
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
