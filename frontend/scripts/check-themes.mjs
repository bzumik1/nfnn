import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function values(source) {
  return new Map(
    [...source.matchAll(/(--receipt-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

export function receiptTokensOutsideRoot(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const blocks = [];
  const outside = new Set();
  let boundary = 0;
  for (const match of code.matchAll(/[{};]|(--receipt-[a-z0-9-]+)\s*:/g)) {
    if (match[0] === '{') {
      blocks.push(code.slice(boundary, match.index).trim());
    } else if (match[0] === '}') {
      blocks.pop();
    } else if (match[1] !== undefined) {
      if (blocks.length !== 1 || blocks[0] !== ':root') {
        outside.add(match[1]);
      }
      continue;
    }
    boundary = match.index + 1;
  }
  return [...outside].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const themeNames = readdirSync(themesDir).filter((name) =>
    statSync(join(themesDir, name)).isDirectory(),
  );
  const sources = new Map(
    themeNames.map((name) => [name, readFileSync(join(themesDir, name, '_theme.scss'), 'utf8')]),
  );
  const themes = new Map(themeNames.map((name) => [name, declared(sources.get(name))]));

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
  const RECEIPT_COLOR = /^#[0-9a-f]{6}$/;
  const RECEIPT_FONT = /^'((?:body|body-bold|heading)\.([0-9a-f]{16})\.ttf)'$/;
  const READ_ON_THE_PAGE = [
    '--receipt-color-text',
    '--receipt-color-muted',
    '--receipt-color-english',
    '--receipt-color-code',
    '--receipt-color-code-mark',
  ];
  const MINIMUM_CONTRAST = 4.5;

  function luminance(hex) {
    const channel = (offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }

  function contrastOnWhite(hex) {
    return 1.05 / (luminance(hex) + 0.05);
  }

  const problems = [];
  for (const theme of themes.keys()) {
    const folder = join(themesDir, theme, 'receipt');
    const tokens = values(sources.get(theme));
    for (const token of receiptTokensOutsideRoot(sources.get(theme))) {
      problems.push(
        `theme ${theme} sets ${token} outside its top-level :root block, so the receipt would depend on the device's settings`,
      );
    }
    const named = new Set();
    for (const [token, value] of tokens) {
      if (token.startsWith('--receipt-color-')) {
        if (!RECEIPT_COLOR.test(value)) {
          problems.push(
            `theme ${theme} sets ${token} to ${value}, not a literal lower-case #rrggbb`,
          );
        } else if (READ_ON_THE_PAGE.includes(token) && contrastOnWhite(value) < MINIMUM_CONTRAST) {
          problems.push(
            `theme ${theme} sets ${token} to ${value}, ${contrastOnWhite(value).toFixed(2)}:1 on the white receipt page, below ${MINIMUM_CONTRAST}:1`,
          );
        }
      }
      if (token.startsWith('--receipt-font-')) {
        const match = RECEIPT_FONT.exec(value);
        if (match === null) {
          problems.push(
            `theme ${theme} sets ${token} to ${value}, not a quoted content-named font file`,
          );
          continue;
        }
        const [, file, hash] = match;
        named.add(file);
        const path = join(folder, file);
        if (!existsSync(path)) {
          problems.push(
            `theme ${theme} names ${file} in ${token}, but src/themes/${theme}/receipt/ has no such file`,
          );
        } else if (
          createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16) !== hash
        ) {
          problems.push(`src/themes/${theme}/receipt/${file} does not match the hash in its name`);
        }
      }
    }
    if (existsSync(folder)) {
      for (const name of readdirSync(folder)) {
        if (name.endsWith('.ttf') && !named.has(name)) {
          problems.push(`src/themes/${theme}/receipt/${name} is a font no receipt token names`);
        }
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
    `${themes.size} themes set all ${needed.size} tokens the styles and the receipt use, and carry content-named receipt fonts, literal receipt colours and readable receipt text, set only in their top-level :root.`,
  );
}
