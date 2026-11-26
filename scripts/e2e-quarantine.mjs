import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tests as listedTests } from '../frontend/scripts/check-e2e-shards.mjs';

export const MAXIMUM_ENTRIES = 5;
export const MAXIMUM_AGE_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;
const SHARD_PROJECTS = /^(?:chromium|baseline|iphone|iphone-sprava|device-[\w-]+)$/;
const SPEC_FILE = /^e2e\/[\w./-]+\.spec\.ts$/;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const TITLE_DELIMITER = '›';

function keyOf(entry) {
  return `[${entry.project}] ${[entry.file, ...entry.title].join(' > ')}`;
}

function shapeProblems(entry, index) {
  const name = `entry ${index + 1}`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`${name} must be an object`];
  }
  const problems = [];
  if (typeof entry.project !== 'string' || !SHARD_PROJECTS.test(entry.project)) {
    problems.push(
      `${name} must name a project the e2e shards run (chromium, baseline, iphone, iphone-sprava or device-*)`,
    );
  }
  if (typeof entry.file !== 'string' || !SPEC_FILE.test(entry.file)) {
    problems.push(`${name} must name its spec file as e2e/<name>.spec.ts`);
  }
  const titleReadable =
    Array.isArray(entry.title) &&
    entry.title.length > 0 &&
    entry.title.every(
      (part) =>
        typeof part === 'string' &&
        part.trim() === part &&
        part !== '' &&
        !part.includes(TITLE_DELIMITER),
    );
  if (!titleReadable) {
    problems.push(
      `${name} must give its title as the list of its describe titles and its test title, none empty or holding ${TITLE_DELIMITER}`,
    );
  }
  if (!Number.isInteger(entry.issue) || entry.issue <= 0) {
    problems.push(`${name} must name the number of its open issue`);
  }
  if (
    typeof entry.since !== 'string' ||
    !UTC_TIME.test(entry.since) ||
    Number.isNaN(Date.parse(entry.since))
  ) {
    problems.push(`${name} must say since when it is in quarantine as YYYY-MM-DDTHH:MM:SSZ`);
  }
  return problems;
}

function ageProblems(entry, now) {
  const since = Date.parse(entry.since);
  if (since > now) {
    return [`${keyOf(entry)} entered the quarantine in the future (${entry.since})`];
  }
  if (now - since > MAXIMUM_AGE_HOURS * HOUR_MS) {
    return [
      `${keyOf(entry)} has been in quarantine for more than ${MAXIMUM_AGE_HOURS} h (since ${entry.since}): fixing #${entry.issue} comes before other work`,
    ];
  }
  return [];
}

export function entryProblems(entries, now) {
  if (!Array.isArray(entries)) {
    return ['the quarantine must be a JSON array of entries'];
  }
  const problems = [];
  if (entries.length > MAXIMUM_ENTRIES) {
    problems.push(`${entries.length} tests are in quarantine, at most ${MAXIMUM_ENTRIES}`);
  }
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
    if (now !== undefined) {
      problems.push(...ageProblems(entry, now));
    }
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

export function githubIssues({
  token,
  repository,
  apiUrl = 'https://api.github.com',
  fetch = globalThis.fetch,
}) {
  return async (number) => {
    const answer = await fetch(`${apiUrl}/repos/${repository}/issues/${number}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (answer.status === 404 || answer.status === 410) {
      return { found: false };
    }
    if (!answer.ok) {
      throw new Error(`GitHub answered ${answer.status} for issue #${number}`);
    }
    const issue = await answer.json();
    return { found: true, state: issue.state, pullRequest: issue.pull_request !== undefined };
  };
}

export function testProblems(entries, fullReport, excludedReport) {
  const all = new Set(listedTests(fullReport).map((test) => test.key));
  const left = new Set(listedTests(excludedReport).map((test) => test.key));
  const quarantined = new Set(entries.map(keyOf));
  const problems = [];
  for (const key of quarantined) {
    if (!all.has(key)) {
      problems.push(`${key} names no test of playwright test --list`);
    } else if (left.has(key)) {
      problems.push(`${key} still runs in the e2e shards`);
    }
  }
  for (const key of all) {
    if (!left.has(key) && !quarantined.has(key)) {
      problems.push(`${key} is left out of the e2e shards without an entry`);
    }
  }
  for (const key of left) {
    if (!all.has(key)) {
      problems.push(`${key} runs in the e2e shards but is missing from the full list`);
    }
  }
  return problems;
}

export function testList(entries) {
  return entries
    .map(
      (entry) =>
        `${[`[${entry.project}]`, entry.file.replace(/^e2e\//, ''), ...entry.title].join(` ${TITLE_DELIMITER} `)}\n`,
    )
    .join('');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function failWith(problems) {
  for (const problem of problems) {
    console.error(
      `::error::${problem.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`,
    );
  }
  process.exit(1);
}

async function main([command, quarantineFile, ...lists]) {
  if (!['entries', 'tests', 'test-list'].includes(command) || !quarantineFile) {
    console.error('usage: node scripts/e2e-quarantine.mjs entries|test-list <quarantine.json>');
    console.error(
      '       node scripts/e2e-quarantine.mjs tests <quarantine.json> <full list JSON> <list JSON without the quarantine>',
    );
    process.exit(2);
  }
  const entries = readJson(quarantineFile);
  const problems = entryProblems(entries, command === 'entries' ? Date.now() : undefined);
  if (problems.length > 0) {
    failWith(problems);
  }
  if (command === 'test-list') {
    process.stdout.write(testList(entries));
    return;
  }
  if (command === 'tests') {
    const [fullFile, excludedFile] = lists;
    if (!fullFile || !excludedFile) {
      failWith([
        'the tests check needs the full Playwright list and the list without the quarantine',
      ]);
    }
    const found = testProblems(entries, readJson(fullFile), readJson(excludedFile));
    if (found.length > 0) {
      failWith(found);
    }
    console.log(
      `e2e quarantine: each of the ${entries.length} quarantined tests exists and only they are left out of the shards`,
    );
    return;
  }
  if (entries.length === 0) {
    console.log('No end-to-end test is in quarantine.');
    return;
  }
  const token = process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    failWith([
      'GH_TOKEN and GITHUB_REPOSITORY are needed to read the issues of the quarantined tests',
    ]);
  }
  const lookup = githubIssues({
    token,
    repository,
    apiUrl: process.env.GITHUB_API_URL || undefined,
  });
  const found = await issueProblems(entries, lookup);
  if (found.length > 0) {
    failWith(found);
  }
  for (const entry of entries) {
    console.log(`in quarantine since ${entry.since}, issue #${entry.issue} open: ${keyOf(entry)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => failWith([error.message]));
}
