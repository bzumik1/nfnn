import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function tests(report) {
  const found = [];
  const walk = (suite, titles) => {
    const path = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        found.push({
          key: `[${test.projectName}] ${[`e2e/${spec.file}`, ...path, spec.title].join(' > ')}`,
          ran: (test.results ?? []).length > 0,
        });
      }
    }
    for (const child of suite.suites ?? []) {
      walk(child, path);
    }
  };
  (report.suites ?? []).forEach((suite) => walk(suite, []));
  return found;
}

function count(keys) {
  const counts = new Map();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function shardProblems(listedReport, mergedReport) {
  const listed = count(tests(listedReport).map((test) => test.key));
  const ran = count(
    tests(mergedReport)
      .filter((test) => test.ran)
      .map((test) => test.key),
  );
  const problems = [];
  for (const [key, expected] of listed) {
    const actual = ran.get(key) ?? 0;
    if (actual < expected) {
      problems.push(`not run in any shard: ${key}`);
    } else if (actual > expected) {
      problems.push(`run in more than one shard: ${key}`);
    }
  }
  for (const key of ran.keys()) {
    if (!listed.has(key)) {
      problems.push(`not listed: ${key}`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [listedFile, mergedFile] = process.argv.slice(2);
  if (!listedFile || !mergedFile) {
    console.error(
      'usage: node scripts/check-e2e-shards.mjs <playwright --list JSON> <merged report JSON>',
    );
    process.exit(2);
  }
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  const listed = read(listedFile);
  const problems = shardProblems(listed, read(mergedFile));
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`::error::${problem}`);
    }
    process.exit(1);
  }
  console.log(
    `e2e shards: each of the ${tests(listed).length} listed tests ran in exactly one shard`,
  );
}
