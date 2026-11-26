import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SCRIPTS_BY_SOURCE = /scripts by source: ([^;]*);/g;
const SOURCE = /(\S+?\.js) \d+ ms/g;
const PROBE = 'https://probe.invalid/';

function rows(suite, path) {
  const here = suite.title.endsWith('.spec.ts') ? path : [...path, suite.title];
  return [
    ...(suite.specs ?? []).map((spec) => ({
      name: [...here, spec.title].join(' › '),
      tests: spec.tests,
    })),
    ...(suite.suites ?? []).flatMap((inner) => rows(inner, here)),
  ];
}

function scriptsNamed(message) {
  const named = new Set();
  for (const [, sources] of message.matchAll(SCRIPTS_BY_SOURCE)) {
    for (const [, source] of sources.matchAll(SOURCE)) {
      if (!source.startsWith(PROBE)) {
        named.add(source.replace(/^https?:\/\/[^/]+/, ''));
      }
    }
  }
  return named;
}

export function throttledMotionReport(report, defect) {
  const lines = [
    `## Známá vada ${defect}: pohyb při pomalejším CPU, rozpočty neškálované`,
    '',
    '| Řádek | Selhal / běhů | Skripty aplikace v hlášení |',
    '|---|---|---|',
  ];
  let failedRows = 0;
  const all = (report.suites ?? []).flatMap((suite) => rows(suite, []));
  for (const row of all) {
    const finals = row.tests
      .map((test) => test.results.at(-1))
      .filter((result) => result !== undefined);
    const failed = finals.filter((result) => !['passed', 'skipped'].includes(result.status));
    const scripts = new Set(
      failed.flatMap((result) =>
        result.errors.flatMap((error) => [...scriptsNamed(error.message ?? '')]),
      ),
    );
    failedRows += failed.length > 0 ? 1 : 0;
    lines.push(
      `| ${row.name} | ${failed.length}/${finals.length} | ${[...scripts].sort().join(', ') || '–'} |`,
    );
  }
  lines.push(
    '',
    `${failedRows} of ${all.length} rows failed at least once; the job stays red until ${defect} lands.`,
  );
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, defect = '#1982'] = process.argv.slice(2);
  console.log(throttledMotionReport(JSON.parse(readFileSync(file, 'utf8')), defect).join('\n'));
}
