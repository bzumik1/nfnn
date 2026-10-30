#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  lstatSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { decodePng } from './png-pixels.mjs';

export const PAGE_TOLERANCE_RATIO = 0.002;
export const ELEMENT_TOLERANCE_PIXELS = 0;
const CROP_MARGIN = 24;
const ELEMENT_MARK = '--';

export function shotKind(file) {
  return file.replace(/-\d+\.png$/, '').includes(ELEMENT_MARK) ? 'element' : 'page';
}

function pixelAt({ width, height, rgba }, x, y) {
  return x < width && y < height ? rgba.readUInt32BE((y * width + x) * 4) : null;
}

export function compareImages(base, head) {
  const width = Math.max(base.width, head.width);
  const height = Math.max(base.height, head.height);
  let differingPixels = 0;
  let box = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const before = pixelAt(base, x, y);
      if (before === null || before !== pixelAt(head, x, y)) {
        differingPixels++;
        box = box
          ? {
              left: Math.min(box.left, x),
              top: Math.min(box.top, y),
              right: Math.max(box.right, x),
              bottom: Math.max(box.bottom, y),
            }
          : { left: x, top: y, right: x, bottom: y };
      }
    }
  }
  return {
    sameSize: base.width === head.width && base.height === head.height,
    differingPixels,
    totalPixels: width * height,
    box: box && {
      x: box.left,
      y: box.top,
      width: box.right - box.left + 1,
      height: box.bottom - box.top + 1,
    },
  };
}

export function withinTolerance(file, { sameSize, differingPixels, totalPixels }) {
  if (!sameSize) {
    return false;
  }
  return shotKind(file) === 'element'
    ? differingPixels <= ELEMENT_TOLERANCE_PIXELS
    : differingPixels <= totalPixels * PAGE_TOLERANCE_RATIO;
}

export function pairShots(baseFiles, headFiles) {
  const base = new Set(baseFiles);
  const head = new Set(headFiles);
  return {
    both: [...head].filter((file) => base.has(file)).sort(),
    added: [...head].filter((file) => !base.has(file)).sort(),
    removed: [...base].filter((file) => !head.has(file)).sort(),
  };
}

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, checksum]);
}

export function encodePng({ width, height, rgba }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function cropAround(image, box, margin = CROP_MARGIN) {
  const left = Math.max(0, box.x - margin);
  const top = Math.max(0, box.y - margin);
  const right = Math.min(image.width, box.x + box.width + margin);
  const bottom = Math.min(image.height, box.y + box.height + margin);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    image.rgba.copy(
      rgba,
      y * width * 4,
      ((top + y) * image.width + left) * 4,
      ((top + y) * image.width + right) * 4,
    );
  }
  return { width, height, rgba };
}

export function diffImage(base, head) {
  const width = Math.max(base.width, head.width);
  const height = Math.max(base.height, head.height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const before = pixelAt(base, x, y);
      const at = (y * width + x) * 4;
      if (before === null || before !== pixelAt(head, x, y)) {
        rgba.set([255, 0, 0, 255], at);
      } else {
        const grey = Math.round(
          (((before >>> 24) & 255) + ((before >>> 16) & 255) + ((before >>> 8) & 255)) / 3,
        );
        const faded = 255 - Math.round((255 - grey) / 4);
        rgba.set([faded, faded, faded, 255], at);
      }
    }
  }
  return { width, height, rgba };
}

const cell = (text) => String(text).replace(/\|/g, '\\|');
const percent = ({ differingPixels, totalPixels }) =>
  `${((differingPixels / totalPixels) * 100).toFixed(3)} %`;

export function reportMarkdown({ base, head, results, added, removed, failedRuns }) {
  const differing = results.filter((result) => !result.passes);
  const lines = [
    '# Srovnání obrazovek se základnou větve',
    '',
    `Základna (merge base): \`${base}\`, hlava: \`${head}\`. Stránka smí mít jiných nejvýš ${PAGE_TOLERANCE_RATIO * 100} % pixelů, výřez (QR kód, bankovní údaje) ${ELEMENT_TOLERANCE_PIXELS} pixelů.`,
    '',
    `Porovnáno ${results.length} snímků: ${results.length - differing.length} shodných, ${differing.length} odlišných, ${added.length} nových, ${removed.length} odebraných.`,
    '',
  ];
  for (const run of failedRuns) {
    lines.push(`- Snímkování \`${run.side}\` skončilo kódem ${run.status}: ${run.log}`);
  }
  if (failedRuns.length > 0) {
    lines.push('');
  }
  if (differing.length > 0) {
    lines.push(
      '## Odlišné snímky',
      '',
      '| Snímek | Druh | Jiných pixelů | Podíl | Velikost | Oblast | Výřezy |',
      '|---|---|---|---|---|---|---|',
    );
    for (const { file, comparison, crops = [] } of differing) {
      const { box } = comparison;
      lines.push(
        `| ${cell(file)} | ${shotKind(file)} | ${comparison.differingPixels} | ${percent(comparison)} | ${comparison.sameSize ? 'stejná' : 'změněná'} | ${box ? `${box.x},${box.y} ${box.width}×${box.height}` : ''} | ${crops.map((crop) => `[${crop.replace(/^.*-(base|head|diff)\.png$/, '$1')}](${crop})`).join(' ')} |`,
      );
    }
    lines.push('');
  }
  if (added.length > 0) {
    lines.push('## Nové snímky (základna je nemá)', '', ...added.map((file) => `- ${file}`), '');
  }
  if (removed.length > 0) {
    lines.push('## Odebrané snímky (hlava je nemá)', '', ...removed.map((file) => `- ${file}`), '');
  }
  return `${lines.join('\n')}\n`;
}

export function outsideRepository(folder, repository) {
  const path = relative(resolve(repository), resolve(folder));
  return path.startsWith('..') || resolve(path) === path;
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  return result.status ?? 1;
}

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

async function serve(root, dist, log) {
  const port = await freePort();
  const server = spawn(
    process.execPath,
    [join(root, 'frontend/scripts/serve-dist.mjs'), dist, String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  const output = [];
  server.stdout.on('data', (data) => output.push(data));
  server.stderr.on('data', (data) => output.push(data));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) {
      break;
    }
    try {
      const answer = await fetch(`${url}/`);
      if (answer.ok) {
        return { url, stop: () => process.kill(-server.pid) };
      }
    } catch {
      await new Promise((wait) => setTimeout(wait, 500));
    }
  }
  writeFileSync(log, Buffer.concat(output));
  throw new Error(`the build in ${dist} was not served (log: ${log})`);
}

function prepareBase(root, base, tree, { headSpec, patch }) {
  git(root, 'worktree', 'add', '--detach', tree, base);
  if (patch) {
    try {
      git(tree, 'apply', '--index', resolve(patch));
    } catch (refused) {
      git(root, 'worktree', 'remove', '--force', tree);
      throw refused;
    }
  }
  const lock = (checkout) => readFileSync(join(checkout, 'frontend/package-lock.json'), 'utf8');
  if (lock(tree) === lock(root) && existsSync(join(root, 'frontend/node_modules'))) {
    symlinkSync(join(root, 'frontend/node_modules'), join(tree, 'frontend/node_modules'), 'dir');
  } else if (run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: join(tree, 'frontend') }) !== 0) {
    throw new Error(`npm ci failed in ${tree}`);
  }
  if (headSpec) {
    cpSync(join(root, 'frontend/e2e/baseline'), join(tree, 'frontend/e2e/baseline'), {
      recursive: true,
    });
  }
}

async function shoot(root, checkout, side, out, screens) {
  const dist = join(out, `${side}-dist`);
  const shots = join(out, `${side}-shots`);
  const log = join(out, `${side}.log`);
  console.log(`== ${side}: production build of ${checkout}`);
  const built = spawnSync('npx', ['ng', 'build', `--output-path=${dist}`], {
    cwd: join(checkout, 'frontend'),
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    writeFileSync(log, `${built.stdout}\n${built.stderr}`);
    throw new Error(`the ${side} build failed (log: ${log})`);
  }
  const server = await serve(root, join(dist, 'browser'), log);
  try {
    console.log(`== ${side}: screens from ${server.url} into ${shots}`);
    const status = run(
      'npx',
      [
        'playwright',
        'test',
        '--project=baseline',
        '--workers=2',
        '--reporter=line',
        '--update-snapshots=all',
      ],
      {
        cwd: join(checkout, 'frontend'),
        env: {
          ...process.env,
          CI: '1',
          BASELINE_SCREENS: screens,
          BASELINE_SCREENS_DIR: shots,
          E2E_BASE_URL: server.url,
        },
      },
    );
    return { shots, status };
  } finally {
    server.stop();
  }
}

const pngs = (folder) =>
  existsSync(folder) ? readdirSync(folder).filter((file) => file.endsWith('.png')) : [];

export function compareFolders(baseShots, headShots, out) {
  const { both, added, removed } = pairShots(pngs(baseShots), pngs(headShots));
  const crops = join(out, 'crops');
  const results = both.map((file) => {
    const base = decodePng(readFileSync(join(baseShots, file)));
    const head = decodePng(readFileSync(join(headShots, file)));
    const comparison = compareImages(base, head);
    const passes = withinTolerance(file, comparison);
    if (passes || comparison.box === null) {
      return { file, comparison, passes };
    }
    mkdirSync(crops, { recursive: true });
    const stem = file.replace(/\.png$/, '');
    const written = [
      ['base', cropAround(base, comparison.box)],
      ['head', cropAround(head, comparison.box)],
      ['diff', cropAround(diffImage(base, head), comparison.box)],
    ].map(([part, image]) => {
      const name = `crops/${stem}-${part}.png`;
      writeFileSync(join(out, name), encodePng(image));
      return name;
    });
    return { file, comparison, passes, crops: written };
  });
  return { results, added, removed };
}

const VALUE_OPTIONS = ['base', 'out', 'patch'];
const SWITCHES = ['head-spec', 'v2-only', 'base-only', 'keep', 'help'];

export function options(argv) {
  const named = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      throw new Error(`unexpected argument ${argument}; give options as --name or --name=value`);
    }
    const [key, ...value] = argument.slice(2).split('=');
    if (VALUE_OPTIONS.includes(key)) {
      if (value.length === 0 || value.join('=') === '') {
        throw new Error(
          `--${key} needs a value: --${key}=<${key === 'base' ? 'commit' : key === 'out' ? 'folder' : 'file'}>`,
        );
      }
      named[key] = value.join('=');
    } else if (SWITCHES.includes(key)) {
      if (value.length > 0) {
        throw new Error(`--${key} takes no value`);
      }
      named[key] = true;
    } else {
      throw new Error(
        `unknown option --${key}; known: ${[...VALUE_OPTIONS, ...SWITCHES].map((name) => `--${name}`).join(', ')}`,
      );
    }
  }
  if (named['head-spec'] && named.patch) {
    throw new Error('--head-spec and --patch both change the spec of the base; give one');
  }
  return named;
}

async function main() {
  const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  let given;
  try {
    given = options(process.argv.slice(2));
  } catch (refused) {
    console.error(refused.message);
    return 2;
  }
  if (given.help) {
    console.log(
      [
        'Usage: node scripts/compare-screens.mjs [--base=<commit>] [--out=<folder outside the repository>] [--head-spec | --patch=<file>] [--v2-only] [--base-only] [--keep]',
        '  --base       the commit to compare with (default: git merge-base origin/main HEAD)',
        "  --head-spec  shoot the base with this checkout's frontend/e2e/baseline, so states the head adds are shot there too",
        '  --patch      apply this patch to the base instead, as regression/v2/additions/<slice>.patch when recording additions from BASELINE_COMMIT',
        '  --v2-only    only the states v2 has (BASELINE_SCREENS=v2), as when recording additions from BASELINE_COMMIT',
        '  --base-only  shoot the base only and compare nothing, as when recording additions',
        '  --keep       keep the temporary worktree of the base',
      ].join('\n'),
    );
    return 0;
  }
  const base = git(
    root,
    'rev-parse',
    '--verify',
    `${given.base ?? git(root, 'merge-base', 'origin/main', 'HEAD')}^{commit}`,
  );
  const head = git(root, 'rev-parse', 'HEAD');
  const out = resolve(given.out ?? mkdtempSync(join(tmpdir(), 'nfnn-screens-')));
  if (!outsideRepository(out, root)) {
    console.error(`${out} is inside the repository; write the comparison to a scratch folder`);
    return 2;
  }
  mkdirSync(out, { recursive: true });
  const screens = given['v2-only'] ? 'v2' : '1';
  const tree = join(out, 'base-tree');
  rmSync(tree, { recursive: true, force: true });
  prepareBase(root, base, tree, {
    headSpec: !!given['head-spec'],
    patch: given.patch,
  });
  try {
    const baseRun = await shoot(root, tree, 'base', out, screens);
    if (given['base-only']) {
      console.log(`base shots in ${baseRun.shots}`);
      return baseRun.status === 0 ? 0 : 1;
    }
    const headRun = await shoot(root, root, 'head', out, screens);
    const compared = compareFolders(baseRun.shots, headRun.shots, out);
    const failedRuns = [
      { side: 'base', status: baseRun.status },
      { side: 'head', status: headRun.status },
    ]
      .filter(({ status }) => status !== 0)
      .map((failed) => ({ ...failed, log: 'see the Playwright output above' }));
    const report = join(out, 'report.md');
    writeFileSync(
      report,
      reportMarkdown({
        base: `${base.slice(0, 8)}${given['head-spec'] ? ' (with the head spec)' : given.patch ? ` (with ${given.patch})` : ''}`,
        head: `${head.slice(0, 8)} + working tree`,
        ...compared,
        failedRuns,
      }),
    );
    const differing = compared.results.filter((result) => !result.passes).length;
    console.log(
      `${compared.results.length} shots compared, ${differing} differ, ${compared.added.length} added, ${compared.removed.length} removed; report ${report}`,
    );
    return differing > 0 || compared.removed.length > 0 || failedRuns.length > 0 ? 1 : 0;
  } finally {
    if (!given.keep) {
      const modules = join(tree, 'frontend/node_modules');
      if (existsSync(modules) && lstatSync(modules).isSymbolicLink()) {
        unlinkSync(modules);
      }
      git(root, 'worktree', 'remove', '--force', tree);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (status) => process.exit(status),
    (error) => {
      console.error(error.message);
      process.exit(2);
    },
  );
}
