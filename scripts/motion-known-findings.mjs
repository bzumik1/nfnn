import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { githubIssues } from './e2e-quarantine.mjs';

export const MOTION_METRICS = [
  'first-move-ms',
  'held-after-release-ms',
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

function keyOf(entry) {
  const step = entry.step === undefined ? '' : ` @ ${entry.step}`;
  return `[${entry.project}] ${entry.file} > ${entry.test}${step}: ${entry.metric}`;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() === value && value !== '';
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
  if (!nonEmpty(entry.test)) {
    problems.push(`${name} must give its test title as Playwright names the test`);
  }
  if ('step' in entry && !nonEmpty(entry.step)) {
    problems.push(`${name} must leave the step out or name it`);
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

export async function issueProblems(entries, lookup) {
  const problems = [];
  for (const entry of entries) {
    const issue = await lookup(entry.issue);
    if (!issue.found) {
      problems.push(`${keyOf(entry)}: issue #${entry.issue} does not exist`);
    } else if (issue.pullRequest) {
      problems.push(`${keyOf(entry)}: #${entry.issue} is a pull request, not an issue`);
    } else if (issue.state !== 'open') {
      problems.push(
        `${keyOf(entry)}: issue #${entry.issue} is closed, so its fix landed and the entry goes`,
      );
    }
  }
  return problems;
}

function failWith(problems) {
  for (const problem of problems) {
    console.error(
      `::error::${problem.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`,
    );
  }
  process.exit(1);
}

async function main([command, file]) {
  if (command !== 'entries' || !file) {
    console.error('usage: node scripts/motion-known-findings.mjs entries <motion-known-findings.json>');
    process.exit(2);
  }
  const entries = JSON.parse(readFileSync(file, 'utf8'));
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
  const found = await issueProblems(
    entries,
    githubIssues({ token, repository, apiUrl: process.env.GITHUB_API_URL || undefined }),
  );
  if (found.length > 0) {
    failWith(found);
  }
  for (const entry of entries) {
    console.log(`known, ceiling ${entry.recorded}, issue #${entry.issue} open: ${keyOf(entry)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => failWith([error.message]));
}
