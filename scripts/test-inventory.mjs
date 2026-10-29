#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'v2-baseline';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaults = {
  junit: 'backend/build/test-results/test,backend/build/test-results/acceptanceTest',
  frontendVitest: 'frontend/test-results/inventory-vitest.json',
  playwright: 'frontend/test-results/inventory-playwright.json',
  mcpVitest: 'mcp/test-results/inventory-vitest.json',
  backend: '',
  part: '',
  out: 'regression/v2/test-inventory.json',
};
const BACKEND_SUITES = ['backend-junit', 'backend-cucumber'];
const SETTINGS = new Set(['out', 'part', 'backend']);

const options = { ...defaults };
for (const argument of process.argv.slice(2)) {
  const [name, value] = argument.replace(/^--/, '').split('=');
  if (!(name in defaults) || value === undefined) {
    console.error(`Unknown option ${argument}; known: ${Object.keys(defaults).join(', ')}`);
    process.exit(2);
  }
  options[name] = value;
}

const at = (path) => resolve(root, path);
const posix = (path) => path.split(sep).join('/');

function decodeXml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

function junit(directories) {
  const backend = [];
  const cucumber = [];
  for (const file of directories.flatMap((directory) =>
    readdirSync(directory)
      .filter((name) => name.endsWith('.xml'))
      .sort()
      .map((name) => join(directory, name)),
  )) {
    const xml = readFileSync(file, 'utf8');
    const suite = attribute(xml.match(/<testsuite\b[^>]*>/)?.[0] ?? '', 'name');
    for (const [tag] of xml.matchAll(/<testcase\b[^>]*>/g)) {
      const name = attribute(tag, 'name');
      const className = attribute(tag, 'classname');
      if (className.startsWith('cz.novanadeje.app.')) {
        backend.push(`${className.replace('cz.novanadeje.app.', '')} > ${name}`);
      } else {
        cucumber.push(`${className || suite} > ${name}`);
      }
    }
  }
  return { backend, cucumber };
}

function vitest(file, base) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return report.testResults.flatMap((result) =>
    result.assertionResults.map((test) =>
      [posix(relative(base, result.name)), ...test.ancestorTitles, test.title].join(' > '),
    ),
  );
}

function playwright(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const names = [];
  const walk = (suite, titles) => {
    const path = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      names.push([`e2e/${posix(spec.file)}`, ...path, spec.title].join(' > '));
    }
    for (const child of suite.suites ?? []) {
      walk(child, path);
    }
  };
  report.suites.forEach((suite) => walk(suite, []));
  return names;
}

function inventory(names) {
  const seen = new Map();
  return names
    .map((name) =>
      name
        .replace(/\s+/g, ' ')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
        .trim(),
    )
    .sort()
    .map((name) => {
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      return count === 1 ? name : `${name} #${count}`;
    });
}

if (options.part !== '' && options.part !== 'backend') {
  console.error(`Unknown part ${options.part}; known: backend`);
  process.exit(2);
}
const needed = Object.entries(options).filter(
  ([name]) =>
    !SETTINGS.has(name) &&
    (options.part === 'backend' ? name === 'junit' : name !== 'junit' || options.backend === ''),
);
if (options.backend !== '') {
  needed.push(['backend', options.backend]);
}
const paths = (name, value) => (name === 'junit' ? value.split(',') : [value]);
for (const [name, path] of needed.flatMap(([name, value]) =>
  paths(name, value).map((path) => [name, path]),
)) {
  if (!existsSync(at(path))) {
    console.error(
      `Missing ${name} report ${path}; see .claude/rules/testing.md "Regression against v2"`,
    );
    process.exit(1);
  }
}

function backendSuites() {
  if (options.backend !== '') {
    const part = JSON.parse(readFileSync(at(options.backend), 'utf8')).suites;
    return Object.fromEntries(BACKEND_SUITES.map((name) => [name, part[name] ?? []]));
  }
  const { backend, cucumber } = junit(paths('junit', options.junit).map(at));
  return { 'backend-junit': inventory(backend), 'backend-cucumber': inventory(cucumber) };
}

const suites =
  options.part === 'backend'
    ? backendSuites()
    : {
        ...backendSuites(),
        'frontend-vitest': inventory(vitest(at(options.frontendVitest), at('frontend'))),
        'frontend-playwright': inventory(playwright(at(options.playwright))),
        'mcp-vitest': inventory(vitest(at(options.mcpVitest), at('mcp'))),
      };
const counts = Object.fromEntries(
  Object.entries(suites).map(([name, tests]) => [name, tests.length]),
);
const empty = Object.entries(counts).filter(([, count]) => count === 0);
if (empty.length > 0) {
  console.error(`No tests found for ${empty.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
writeFileSync(at(options.out), `${JSON.stringify({ source: SOURCE, counts, suites }, null, 2)}\n`);
console.log(`Wrote ${options.out}: ${JSON.stringify(counts)}`);
