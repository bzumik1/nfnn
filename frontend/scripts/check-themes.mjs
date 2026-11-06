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
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
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

const TAB_BAR = '--color-tab-bar';
const TAB_PILL = '--color-tab-pill';
const TAB_BAR_TOKENS = [
  TAB_BAR,
  TAB_PILL,
  '--color-tab-active',
  '--color-on-tab-bar',
  '--color-tab-focus-ring',
];
const TAB_BAR_PAIRS = [
  { text: '--color-on-tab-bar', under: [TAB_BAR], minimum: 4.5 },
  { text: '--color-tab-active', under: [TAB_PILL, TAB_BAR], minimum: 4.5 },
  { text: '--color-tab-focus-ring', under: [TAB_BAR], minimum: 3 },
  { text: '--color-tab-focus-ring', under: [TAB_PILL, TAB_BAR], minimum: 3 },
];
const SOLID_BAR_PAIRS = [{ top: TAB_PILL, under: [TAB_BAR], minimum: 3 }];
const PAGES = [
  { name: 'white', rgb: [255, 255, 255] },
  { name: 'black', rgb: [0, 0, 0] },
];

function declarationsByBlock(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const blocks = [];
  const found = [];
  let boundary = 0;
  for (const match of code.matchAll(/[{};]|(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (match[0] === '{') {
      blocks.push(code.slice(boundary, match.index).trim());
    } else if (match[0] === '}') {
      blocks.pop();
    } else if (match[1] !== undefined) {
      found.push({ chain: [...blocks], name: match[1], value: match[2].trim() });
    }
    boundary = match.index + match[0].length;
  }
  return found;
}

function rgbOf(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function colourOf(written) {
  const value = written.toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return { rgb: rgbOf(value), alpha: 1 };
  }
  const mix = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+(?:\.\d+)?)%, transparent\)$/.exec(value);
  return mix === null ? null : { rgb: rgbOf(mix[1]), alpha: Number(mix[2]) / 100 };
}

function over(top, ground) {
  return top.rgb.map((channel, index) => channel * top.alpha + ground[index] * (1 - top.alpha));
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first, second) {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

export function barContrastProblems(theme, source) {
  const declarations = declarationsByBlock(source).filter((declaration) =>
    TAB_BAR_TOKENS.includes(declaration.name),
  );
  const atRoot = new Map(
    declarations
      .filter(({ chain }) => chain.length === 1 && chain[0] === ':root')
      .map(({ name, value }) => [name, value]),
  );
  const problems = [];
  for (const { chain, name } of declarations) {
    const checked =
      (chain.length === 1 && chain[0] === ':root') ||
      (chain.length === 2 && chain[0].startsWith('@media') && chain[1] === ':root');
    if (!checked) {
      problems.push(
        `theme ${theme} sets ${name} under ${chain.join(' > ')}, where its contrast is not checked; set it in the top-level :root or a @media block of :root`,
      );
    }
  }
  for (const token of TAB_BAR_TOKENS) {
    if (!atRoot.has(token)) {
      problems.push(`theme ${theme} does not set ${token} in its top-level :root`);
    }
  }
  for (const { name, value } of declarations) {
    const colour = colourOf(value);
    const text = TAB_BAR_PAIRS.some((pair) => pair.text === name);
    if (colour === null || (text && colour.alpha !== 1)) {
      problems.push(
        `theme ${theme} sets ${name} to ${value}, not a literal #rrggbb${text ? '' : ' or a color-mix of one with transparent'}`,
      );
    }
  }
  if (problems.length > 0) {
    return problems;
  }
  const contexts = [{ label: '', values: atRoot }];
  for (const chain of new Set(
    declarations
      .filter(
        ({ chain }) => chain.length === 2 && chain[1] === ':root' && chain[0].startsWith('@media'),
      )
      .map(({ chain }) => chain[0]),
  )) {
    const values = new Map(atRoot);
    for (const declaration of declarations) {
      if (declaration.chain[0] === chain && declaration.chain.length === 2) {
        values.set(declaration.name, declaration.value);
      }
    }
    contexts.push({ label: ` under ${chain}`, values });
  }
  for (const { label, values } of contexts) {
    for (const page of PAGES) {
      for (const pair of TAB_BAR_PAIRS) {
        const ground = [...pair.under]
          .reverse()
          .reduce((below, token) => over(colourOf(values.get(token)), below), page.rgb);
        const ratio = contrast(colourOf(values.get(pair.text)).rgb, ground);
        if (ratio < pair.minimum) {
          problems.push(
            `theme ${theme}${label}: ${pair.text} on ${pair.under.join(' over ')} over a ${page.name} page is ${ratio.toFixed(2)}:1, below ${pair.minimum}:1`,
          );
        }
      }
    }
    for (const pair of SOLID_BAR_PAIRS) {
      const layers = [pair.top, ...pair.under].map((token) => colourOf(values.get(token)));
      if (layers.some((layer) => layer.alpha !== 1)) {
        continue;
      }
      const ratio = contrast(layers[0].rgb, layers[1].rgb);
      if (ratio < pair.minimum) {
        problems.push(
          `theme ${theme}${label}: solid ${pair.top} on ${pair.under.join(' over ')} is ${ratio.toFixed(2)}:1, below ${pair.minimum}:1`,
        );
      }
    }
  }
  return problems;
}

const DARK_SCHEME = /^@media \(prefers-color-scheme: dark\)/;
const APPEARANCES = [
  {
    name: 'light appearance',
    media: { 'prefers-color-scheme': 'light', 'prefers-contrast': 'no-preference' },
  },
  {
    name: 'light appearance with more contrast',
    media: { 'prefers-color-scheme': 'light', 'prefers-contrast': 'more' },
  },
  {
    name: 'dark appearance',
    media: { 'prefers-color-scheme': 'dark', 'prefers-contrast': 'no-preference' },
  },
  {
    name: 'dark appearance with more contrast',
    media: { 'prefers-color-scheme': 'dark', 'prefers-contrast': 'more' },
  },
];
const TINTED_GROUNDS = [
  '--color-surface',
  '--color-surface-alt',
  '--color-surface-muted',
  '--color-surface-accent',
  '--color-accent-soft',
  '--color-accent-bg',
];
const INVERSE_GROUNDS = ['--color-surface-inverse', '--color-surface-inverse-strong'];
const READABLE_PAIRS = [
  {
    texts: ['--color-text', '--color-text-secondary', '--color-text-muted', '--color-accent'],
    grounds: TINTED_GROUNDS,
    minimum: 4.5,
  },
  {
    texts: ['--color-text-soft', '--color-text-subtle', '--color-danger'],
    grounds: ['--color-surface', '--color-surface-alt'],
    minimum: 4.5,
  },
  { texts: ['--color-on-accent'], grounds: ['--color-accent-fill'], minimum: 4.5 },
  { texts: ['--color-on-danger'], grounds: ['--color-danger-fill'], minimum: 4.5 },
  {
    texts: ['--color-on-inverse', '--color-accent-on-inverse'],
    grounds: INVERSE_GROUNDS,
    minimum: 4.5,
  },
  { texts: ['--color-on-inverse'], grounds: ['--color-surface-quote'], minimum: 4.5 },
  { texts: ['--color-danger'], grounds: ['--color-danger-bg'], minimum: 4.5 },
  { texts: ['--color-warning'], grounds: ['--color-warning-bg'], minimum: 4.5 },
  { texts: ['--color-success'], grounds: ['--color-success-bg'], minimum: 4.5 },
  {
    texts: ['--color-focus-ring'],
    grounds: ['--color-surface', '--color-surface-alt', '--color-surface-inverse'],
    minimum: 3,
  },
  {
    texts: ['--color-border-field'],
    grounds: ['--color-surface', '--color-surface-alt'],
    minimum: 3,
    softInTheDefaultLook: true,
  },
];

function mediaMatches(query, media) {
  const conditions = query.replace(/^@media\s+/, '').split(/\s+and\s+/);
  return conditions.every((condition) => {
    const feature = /^\(\s*([a-z-]+)\s*:\s*([a-z-]+)\s*\)$/.exec(condition.trim());
    return feature !== null && media[feature[1]] === feature[2];
  });
}

function tokensIn(declarations, media) {
  const tokens = new Map();
  for (const { chain, name, value } of declarations) {
    const atRoot = chain.length === 1 && chain[0] === ':root';
    const inMedia =
      chain.length === 2 &&
      chain[1] === ':root' &&
      chain[0].startsWith('@media') &&
      mediaMatches(chain[0], media);
    if (atRoot || inMedia) {
      tokens.set(name, value);
    }
  }
  return tokens;
}

function resolvedColour(tokens, name, seen = new Set()) {
  const value = tokens.get(name);
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(value ?? '');
  if (reference !== null && !seen.has(reference[1])) {
    return resolvedColour(tokens, reference[1], seen.add(name));
  }
  return { written: value, colour: value === undefined ? null : colourOf(value) };
}

export function appearanceProblems(theme, source) {
  const declarations = declarationsByBlock(source);
  const darkBlock = declarations.some(
    ({ chain }) => chain.length === 2 && DARK_SCHEME.test(chain[0]) && chain[1] === ':root',
  );
  if (!darkBlock) {
    return [
      `theme ${theme} sets no colours under @media (prefers-color-scheme: dark), so it ignores the dark appearance of the device`,
    ];
  }
  const problems = [];
  for (const appearance of APPEARANCES) {
    const tokens = tokensIn(declarations, appearance.media);
    const label = `theme ${theme} in the ${appearance.name}`;
    const measurable = (name) => {
      const { written, colour } = resolvedColour(tokens, name);
      if (colour === null) {
        problems.push(
          `${label}: ${name} is ${written}, not a colour whose contrast can be measured`,
        );
      }
      return colour;
    };
    const page = measurable('--color-surface');
    if (page === null) {
      continue;
    }
    for (const pair of READABLE_PAIRS) {
      if (pair.softInTheDefaultLook && appearance.name === 'light appearance') {
        continue;
      }
      for (const ground of pair.grounds) {
        const groundColour = measurable(ground);
        for (const text of pair.texts) {
          const textColour = measurable(text);
          if (groundColour === null || textColour === null) {
            continue;
          }
          const under = over(groundColour, page.rgb);
          const ratio = contrast(over(textColour, under), under);
          if (ratio < pair.minimum) {
            problems.push(
              `${label}: ${text} on ${ground} is ${ratio.toFixed(2)}:1, below ${pair.minimum}:1`,
            );
          }
        }
      }
    }
  }
  return [...new Set(problems)];
}

function assetInputs(assets) {
  return (assets ?? []).map((asset) => (typeof asset === 'string' ? asset : asset.input));
}

function servesAtRoot(assets, folder) {
  return (assets ?? []).some(
    (asset) =>
      typeof asset === 'object' &&
      asset.input === folder &&
      asset.glob === '**/*' &&
      (asset.output === undefined || asset.output === '/'),
  );
}

export function themeAssetProblems({ reference, assets, publicFiles, angular }) {
  const problems = [];
  const expected = new Set(assets.get(reference) ?? []);
  for (const [theme, files] of assets) {
    if (theme === reference) {
      continue;
    }
    const own = new Set(files);
    for (const file of expected) {
      if (!own.has(file)) {
        problems.push(`theme ${theme} has no assets/${file}, which ${reference} serves`);
      }
    }
    for (const file of own) {
      if (!expected.has(file)) {
        problems.push(`theme ${theme} serves assets/${file}, which ${reference} does not`);
      }
    }
  }
  const served = new Set([...assets.values()].flat());
  for (const file of publicFiles) {
    if (served.has(file)) {
      problems.push(
        `public/${file} is served at the same address as the theme file assets/${file}`,
      );
    }
  }
  const build = angular.projects.frontend.architect.build;
  const folder = (theme) => `src/themes/${theme}/assets`;
  const builds = [
    { label: 'the default build', theme: reference, assets: build.options.assets },
    ...[...assets.keys()]
      .filter((theme) => theme !== reference)
      .map((theme) => ({
        label: `the build configuration ${theme}-theme`,
        theme,
        assets: build.configurations?.[`${theme}-theme`]?.assets,
      })),
  ];
  for (const { label, theme, assets: list } of builds) {
    if (!servesAtRoot(list, folder(theme))) {
      problems.push(`${label} does not serve ${folder(theme)} at the site root`);
    }
    for (const other of assets.keys()) {
      if (other !== theme && assetInputs(list).includes(folder(other))) {
        problems.push(`${label} serves ${folder(other)}, the files of another theme`);
      }
    }
  }
  return problems;
}

const MANIFEST_FIELDS = [
  ['id', '/aplikace'],
  ['start_url', '/aplikace'],
  ['scope', '/'],
  ['display', 'standalone'],
  ['lang', 'cs'],
];

const HOME_SCREEN_NAME_MAX_LENGTH = 12;

const MANIFEST_COLOURS = [
  ['theme_color', '--color-accent'],
  ['background_color', '--color-surface'],
];

const REQUIRED_ICONS = [
  ['any', '192x192'],
  ['any', '512x512'],
  ['maskable', '512x512'],
];

export function manifestProblems({ theme, manifest, source, iconSizes, homeScreenTitle }) {
  if (manifest === null) {
    return [`theme ${theme} has no assets/manifest.webmanifest`];
  }
  const problems = [];
  for (const [field, wanted] of MANIFEST_FIELDS) {
    if (manifest[field] !== wanted) {
      problems.push(`theme ${theme}: manifest ${field} is ${manifest[field]}, not ${wanted}`);
    }
  }
  const shortName = String(manifest.short_name ?? '');
  if ([...shortName].length > HOME_SCREEN_NAME_MAX_LENGTH) {
    problems.push(
      `theme ${theme}: manifest short_name ${shortName} is longer than ${HOME_SCREEN_NAME_MAX_LENGTH} characters`,
    );
  }
  if (shortName !== homeScreenTitle) {
    problems.push(
      `theme ${theme}: manifest short_name ${shortName} is not the apple-mobile-web-app-title ${homeScreenTitle} of src/index.html`,
    );
  }
  const atRoot = new Map(
    declarationsByBlock(source)
      .filter(({ chain }) => chain.length === 1 && chain[0] === ':root')
      .map(({ name, value }) => [name, value.toLowerCase()]),
  );
  for (const [field, token] of MANIFEST_COLOURS) {
    const value = String(manifest[field] ?? '').toLowerCase();
    if (value !== atRoot.get(token)) {
      problems.push(
        `theme ${theme}: manifest ${field} ${manifest[field]} is not ${token} ${atRoot.get(token)}`,
      );
    }
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const icon of icons) {
    const size = iconSizes.get(String(icon.src).replace(/^\//, ''));
    if (size === undefined || icon.type !== 'image/png') {
      problems.push(`theme ${theme}: manifest icon ${icon.src} is not a PNG in assets/`);
    } else if (`${size[0]}x${size[1]}` !== icon.sizes) {
      problems.push(
        `theme ${theme}: manifest icon ${icon.src} is ${size[0]}x${size[1]}, not ${icon.sizes}`,
      );
    }
  }
  for (const [purpose, sizes] of REQUIRED_ICONS) {
    if (!icons.some((icon) => (icon.purpose ?? 'any') === purpose && icon.sizes === sizes)) {
      problems.push(`theme ${theme}: manifest has no ${purpose} icon of ${sizes}`);
    }
  }
  return problems;
}

function homeScreenTitleOf(html) {
  const meta = html.match(/<meta\s+name="apple-mobile-web-app-title"\s+content="([^"]*)"/);
  return meta ? meta[1] : null;
}

function pngSize(path) {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString('hex');
  return signature === '89504e470d0a1a0a' ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : null;
}

function iconSizesUnder(dir) {
  return new Map(
    filesUnder(dir)
      .filter((file) => file.endsWith('.png'))
      .map((file) => [file, pngSize(join(dir, file))])
      .filter(([, size]) => size !== null),
  );
}

function manifestIn(dir) {
  const path = join(dir, 'manifest.webmanifest');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? filesUnder(path, `${prefix}${name}/`)
      : [`${prefix}${name}`];
  });
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
  const homeScreenTitle = homeScreenTitleOf(readFileSync(join(root, 'src/index.html'), 'utf8'));
  for (const [theme, source] of sources) {
    problems.push(...barContrastProblems(theme, source));
    problems.push(...appearanceProblems(theme, source));
    const assetsDir = join(themesDir, theme, 'assets');
    problems.push(
      ...manifestProblems({
        theme,
        manifest: manifestIn(assetsDir),
        source,
        iconSizes: iconSizesUnder(assetsDir),
        homeScreenTitle,
      }),
    );
  }
  problems.push(
    ...themeAssetProblems({
      reference,
      assets: new Map(
        themeNames.map((name) => [name, filesUnder(join(themesDir, name, 'assets')).sort()]),
      ),
      publicFiles: filesUnder(join(root, 'public')),
      angular: JSON.parse(readFileSync(join(root, 'angular.json'), 'utf8')),
    }),
  );
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
    `${themes.size} themes set all ${needed.size} tokens the styles and the receipt use, and carry content-named receipt fonts, literal receipt colours and readable receipt text, set only in their top-level :root, keep text, controls and focus rings readable in the light and the dark appearance, with and without more contrast, keep the tab bar readable over a white and a black page, its solid pill apart from the bar, serve the same theme files and a web app manifest in their colours with the icons it names and the home screen name of src/index.html.`,
  );
}
