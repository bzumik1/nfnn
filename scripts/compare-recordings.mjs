#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [first, second] = process.argv.slice(2);
if (!first || !second) {
  console.error('Usage: node scripts/compare-recordings.mjs <first recording> <second recording>');
  process.exit(2);
}

function jsonFiles(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

function recording(directory) {
  const scenarios = new Map();
  for (const path of jsonFiles(directory)) {
    const file = JSON.parse(readFileSync(path, 'utf8'));
    const feature = file.feature ?? relative(directory, path).split(sep).join('/');
    for (const [name, scenario] of Object.entries(file.scenarios ?? {})) {
      scenarios.set(`${feature}: ${name}`, JSON.stringify(scenario));
    }
  }
  return scenarios;
}

const before = recording(first);
const after = recording(second);
const problems = [];
for (const [label, scenario] of before) {
  if (!after.has(label)) {
    problems.push(`${label} is missing from the second recording`);
  } else if (after.get(label) !== scenario) {
    problems.push(`${label} recorded otherwise the second time`);
  }
}
for (const label of after.keys()) {
  if (!before.has(label)) {
    problems.push(`${label} is only in the second recording`);
  }
}
for (const problem of problems) {
  console.log(
    `::error::${problem}: the scenario is not deterministic, so fix it at its source (testing.md, "Regression against v2")`,
  );
}
console.log(
  `${before.size} scenarios recorded twice, ${problems.length} of them differ (${first} and ${second})`,
);
process.exit(problems.length === 0 ? 0 : 1);
