import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { githubIssues } from './e2e-quarantine.mjs';

export const MOTION_METRICS = [
  'first-move-ms',
  'held-ms',
  'first-frame-share',
  'step-curve-steps',
  'back-px',
  'still-px',
  'frozen-ms',
  'off-the-curve-frames',
  'under-the-finger-px',
  'under-the-finger-frames',
  'band-levels',
  'ends-after-the-step-ms',
  'press-shown-ms',
];

const PROJECTS = /^(?:chromium|iphone|iphone-sprava|motion-timed)$/;
const SPEC_FILE = /^e2e\/[\w./-]+\.spec\.ts$/;

const TITLE_DELIMITER = '›';
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

function keyOf(entry) {
  const step = entry.step === undefined ? '' : ` @ ${entry.step}`;
  return `[${entry.project}] ${[entry.file, ...entry.title].join(' > ')}${step}: ${entry.metric}`;
}

function nonEmpty(value) {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value !== '' &&
    !CONTROL_CHARACTER.test(value)
  );
}

function readableTitle(title) {
  return (
    Array.isArray(title) &&
    title.length > 0 &&
    title.every((part) => nonEmpty(part) && !part.includes(TITLE_DELIMITER))
  );
}

function shapeProblems(entry, index) {
  const name = `entry ${index + 1}`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`${name} must be an object`];
  }
  const problems = [];
  if (typeof entry.project !== 'string' || !PROJECTS.test(entry.project)) {
    problems.push(`${name} must name a project that runs motion (chromium, iphone, iphone-sprava or motion-timed)`);
  }
  if (typeof entry.file !== 'string' || !SPEC_FILE.test(entry.file)) {
    problems.push(`${name} must name its spec file as e2e/<name>.spec.ts`);
  }
  if (!readableTitle(entry.title)) {
    problems.push(
      `${name} must give its title as the list of its describe titles and its test title, as Playwright names the test, none empty, holding ${TITLE_DELIMITER} or a control character`,
    );
  }
  if ('step' in entry && !nonEmpty(entry.step)) {
    problems.push(`${name} must leave the step out or name it, with no control character`);
  }
  if (!MOTION_METRICS.includes(entry.metric)) {
    problems.push(`${name} must name a metric of ${MOTION_METRICS.join(', ')}`);
  }
  if (typeof entry.recorded !== 'number' || !Number.isFinite(entry.recorded)) {
    problems.push(`${name} must give the value recorded on main, its ceiling, as recorded`);
  }
  if (typeof entry.everyRun !== 'boolean') {
    problems.push(`${name} must say in everyRun whether main breached the bound in every run`);
  }
  if (!Number.isInteger(entry.issue) || entry.issue <= 0) {
    problems.push(`${name} must name the number of its open issue`);
  }
  return problems;
}

export function entryProblems(entries) {
  if (!Array.isArray(entries)) {
    return ['the known motion findings must be a JSON array of entries'];
  }
  const problems = [];
  const seen = new Set();
  entries.forEach((entry, index) => {
    const shape = shapeProblems(entry, index);
    problems.push(...shape);
    if (shape.length > 0) {
      return;
    }
    const key = keyOf(entry);
    if (seen.has(key)) {
      problems.push(`${key} is listed twice`);
    }
    seen.add(key);
  });
  return problems;
}

export const CLOSED_ISSUE_BY_MODE = {
  pull_request: 'error',
  push: 'warning',
  nightly: 'error',
};

const REGISTRY = 'frontend/e2e/motion-known-findings.json';

async function issueFindings(entries, lookup) {
  const byIssue = new Map();
  for (const entry of entries) {
    byIssue.set(entry.issue, [...(byIssue.get(entry.issue) ?? []), entry]);
  }
  const findings = [];
  for (const [number, ofIt] of byIssue) {
    const issue = await lookup(number);
    const named = `${ofIt.length} ${ofIt.length === 1 ? 'entry' : 'entries'}`;
    if (!issue.found) {
      findings.push({ kind: 'broken', message: `issue #${number} does not exist, named by ${named}: ${ofIt.map(keyOf).join('; ')}` });
    } else if (issue.pullRequest) {
      findings.push({ kind: 'broken', message: `#${number} is a pull request, not an issue, named by ${named}: ${ofIt.map(keyOf).join('; ')}` });
    } else if (issue.state !== 'open') {
      findings.push({
        kind: 'closed',
        message: `issue #${number} is closed, so its fix landed: remove its ${named} from ${REGISTRY}: ${ofIt.map(keyOf).join('; ')}`,
      });
    }
  }
  return findings;
}

export async function issueProblems(entries, lookup) {
  return (await issueFindings(entries, lookup)).map((finding) => finding.message);
}

export async function checkEntries(entries, { mode, lookup }) {
  if (!Object.hasOwn(CLOSED_ISSUE_BY_MODE, mode ?? '')) {
    throw new Error(`unknown mode ${mode}: give --mode=${Object.keys(CLOSED_ISSUE_BY_MODE).join('|')}`);
  }
  const problems = entryProblems(entries);
  if (problems.length > 0) {
    return { errors: problems, warnings: [] };
  }
  const findings = await issueFindings(entries, lookup);
  const broken = findings.filter((finding) => finding.kind === 'broken').map((finding) => finding.message);
  const closed = findings.filter((finding) => finding.kind === 'closed').map((finding) => finding.message);
  return CLOSED_ISSUE_BY_MODE[mode] === 'warning'
    ? { errors: broken, warnings: closed }
    : { errors: [...broken, ...closed], warnings: [] };
}

function listedTests(report) {
  const listed = new Set();
  const walk = (suite, titles) => {
    const path = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        listed.add(JSON.stringify([test.projectName, `e2e/${spec.file}`, [...path, spec.title]]));
      }
    }
    for (const child of suite.suites ?? []) {
      walk(child, path);
    }
  };
  (report.suites ?? []).forEach((suite) => walk(suite, []));
  return listed;
}

export function testProblems(entries, fullReport) {
  const listed = listedTests(fullReport);
  return entries
    .filter((entry) => !listed.has(JSON.stringify([entry.project, entry.file, entry.title])))
    .map(
      (entry) =>
        `${keyOf(entry)} names no test of playwright test --list: its test was renamed, moved or removed, so the entry no longer judges anything`,
    );
}

function annotation(level, message) {
  return `::${level}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`;
}

function failWith(problems) {
  for (const problem of problems) {
    console.error(annotation('error', problem));
  }
  process.exit(1);
}

const USAGE = [
  'usage: node scripts/motion-known-findings.mjs entries <motion-known-findings.json> --mode=pull_request|push|nightly',
  '       node scripts/motion-known-findings.mjs tests <motion-known-findings.json> <full Playwright list JSON>',
];

function usage() {
  console.error(USAGE.join('\n'));
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function runTests(file, listFile) {
  if (!listFile) {
    failWith(['the tests check needs the full Playwright list (playwright test --list --project=* --reporter=json)']);
  }
  const entries = readJson(file);
  const problems = entryProblems(entries);
  if (problems.length > 0) {
    failWith(problems);
  }
  const found = testProblems(entries, readJson(listFile));
  if (found.length > 0) {
    failWith(found);
  }
  console.log(`known motion findings: each of the ${entries.length} entries names a listed test of its project`);
}

async function runEntries(file, mode) {
  if (!Object.hasOwn(CLOSED_ISSUE_BY_MODE, mode ?? '')) {
    usage();
  }
  const entries = readJson(file);
  const problems = entryProblems(entries);
  if (problems.length > 0) {
    failWith(problems);
  }
  if (entries.length === 0) {
    console.log('No motion finding is known.');
    return;
  }
  const token = process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    failWith(['GH_TOKEN and GITHUB_REPOSITORY are needed to read the issues of the known motion findings']);
  }
  const { errors, warnings } = await checkEntries(entries, {
    mode,
    lookup: githubIssues({ token, repository, apiUrl: process.env.GITHUB_API_URL || undefined }),
  });
  for (const warning of warnings) {
    console.log(annotation('warning', warning));
  }
  if (errors.length > 0) {
    failWith(errors);
  }
  console.log(`known motion findings: ${entries.length} entries, every issue checked (${mode})`);
}

async function main([command, file, ...rest]) {
  if (!file) {
    usage();
  }
  if (command === 'tests') {
    runTests(file, rest[0]);
    return;
  }
  if (command === 'entries') {
    const mode = rest.map((arg) => arg.match(/^--mode=(.+)$/)?.[1]).find(Boolean);
    await runEntries(file, mode);
    return;
  }
  usage();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => failWith([error.message]));
}
