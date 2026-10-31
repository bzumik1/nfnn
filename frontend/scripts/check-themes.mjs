import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const themesDir = join(root, 'src/themes');
const reference = 'nova-nadeje';

function scssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return path === themesDir ? [] : scssFiles(path);
    }
    return name.endsWith('.scss') ? [path] : [];
  });
}

function declared(source) {
  return new Set([...source.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

function used(source) {
  return new Set([...source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]));
}

const themes = new Map(
  readdirSync(themesDir)
    .filter((name) => statSync(join(themesDir, name)).isDirectory())
    .map((name) => [name, declared(readFileSync(join(themesDir, name, '_theme.scss'), 'utf8'))]),
);

const needed = new Map();
for (const file of scssFiles(join(root, 'src'))) {
  const source = readFileSync(file, 'utf8');
  const local = declared(source);
  for (const token of used(source)) {
    if (!local.has(token)) {
      needed.set(token, relative(root, file));
    }
  }
}

const receiptStyle = 'src/app/features/donations/receipt-pdf/receipt-style.ts';
for (const [, token] of readFileSync(join(root, receiptStyle), 'utf8').matchAll(
  /'(--receipt-[a-z0-9-]+)'/g,
)) {
  needed.set(token, receiptStyle);
}
const receiptFonts = ['body.ttf', 'body-bold.ttf', 'heading.ttf'];

const problems = [];
for (const theme of themes.keys()) {
  const folder = join(themesDir, theme, 'receipt');
  for (const font of receiptFonts) {
    if (!existsSync(join(folder, font))) {
      problems.push(`theme ${theme} has no receipt font src/themes/${theme}/receipt/${font}`);
    }
  }
  if (!existsSync(folder) || !readdirSync(folder).some((name) => name.endsWith('.txt'))) {
    problems.push(`theme ${theme} has no licence beside its receipt fonts`);
  }
}
const expected = themes.get(reference);
if (!expected) {
  problems.push(`the reference theme src/themes/${reference}/_theme.scss is missing`);
}
for (const [theme, tokens] of themes) {
  for (const [token, file] of needed) {
    if (!tokens.has(token)) {
      problems.push(`theme ${theme} does not set ${token}, used in ${file}`);
    }
  }
  for (const token of expected ?? []) {
    if (!tokens.has(token)) {
      problems.push(`theme ${theme} does not set ${token}, which ${reference} sets`);
    }
  }
  for (const token of tokens) {
    if (expected && !expected.has(token)) {
      problems.push(`theme ${theme} sets ${token}, which ${reference} does not`);
    }
  }
}

if (problems.length > 0) {
  console.error([...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log(
  `${themes.size} themes set all ${needed.size} tokens the styles and the receipt use, and carry the receipt fonts.`,
);
