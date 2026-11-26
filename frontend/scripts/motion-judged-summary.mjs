import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MATRIX = /(^|\/)(sprava-)?back-matrix\.spec\.ts$/;
const NOT_JUDGED = 'nfnn-not-judged';
const STAMP_LAG = 'nfnn-stamp-lag';

const REVIEWED_LAG = JSON.parse(
  readFileSync(fileURLToPath(new URL('../e2e/stamp-lag.json', import.meta.url)), 'utf8'),
);

function p99Of(sorted) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)];
}

function stepLagsOf(report) {
  return report.suites
    .flatMap(rowsOf)
    .filter((row) => MATRIX.test(row.file))
    .flatMap(({ test }) => test.annotations ?? [])
    .filter((annotation) => annotation.type === STAMP_LAG)
    .flatMap((annotation) => annotation.description.split(' ').map(Number))
    .filter(Number.isFinite)
    .sort((one, other) => one - other);
}

export function stampLagAboveTheReviewed(report, reviewed) {
  const lags = stepLagsOf(report);
  if (lags.length === 0) {
    return `No step frame of this run had its stamp lag measured, so the reviewed ${reviewed.toFixed(2)} of frontend/e2e/stamp-lag.json (ci.p99Frames) went unchecked: no step frame of this run reached the judge on the screen.`;
  }
  if (p99Of(lags) <= reviewed) {
    return null;
  }
  const measured = p99Of(lags).toFixed(2);
  return `The p99 stamp lag of this run's step frames, ${measured}, is above the reviewed ${reviewed.toFixed(2)} of frontend/e2e/stamp-lag.json (ci.p99Frames), with which the back matrix judged its rows: raise it to ${measured} in a reviewed commit, naming this run.`;
}

function rowsOf(suite) {
  return [
    ...(suite.specs ?? []).flatMap((spec) =>
      spec.tests.map((test) => ({ file: spec.file, title: spec.title, test })),
    ),
    ...(suite.suites ?? []).flatMap(rowsOf),
  ];
}

export function judgedOnTheScreen(report) {
  const rows = report.suites
    .flatMap(rowsOf)
    .filter(
      (row) =>
        MATRIX.test(row.file) ||
        (row.test.annotations ?? []).some((annotation) => annotation.type === NOT_JUDGED),
    );
  if (rows.length === 0) {
    return 'On the screen, where the runner captures frames: no row of the back matrix ran.\n';
  }
  const projects = new Map();
  const notJudged = [];
  const lags = stepLagsOf(report);
  for (const { title, test } of rows) {
    const annotations = test.annotations ?? [];
    const steps = annotations.filter((annotation) => annotation.type === NOT_JUDGED);
    const onTheScreen = annotations.some((annotation) => annotation.type === STAMP_LAG);
    const status = test.results.at(-1)?.status;
    if (steps.length > 0 && status === 'skipped') {
      const counts = projects.get(test.projectName) ?? { judged: 0, notJudged: 0 };
      counts.notJudged += 1;
      projects.set(test.projectName, counts);
      notJudged.push(
        `- ${test.projectName}: ${title} (${steps.map((step) => step.description).join('; ')})`,
      );
    } else if (onTheScreen && status !== 'skipped') {
      const counts = projects.get(test.projectName) ?? { judged: 0, notJudged: 0 };
      counts.judged += 1;
      projects.set(test.projectName, counts);
    }
  }
  return [
    '### The motion on the screen, where the runner captures frames',
    '',
    '| Project | Rows that judged screencast frames | Rows not judged on this runner |',
    '|---|---|---|',
    ...[...projects].map(
      ([project, counts]) => `| ${project} | ${counts.judged} | ${counts.notJudged} |`,
    ),
    '',
    lags.length === 0
      ? 'The screencast stamp lag on this runner: no frame was measured.'
      : `The screencast stamp lag on this runner: p99 ${p99Of(lags).toFixed(2)} steady frames over ${lags.length} frames (median ${lags[Math.floor(lags.length / 2)].toFixed(2)}), reviewed ${REVIEWED_LAG.ci.p99Frames.toFixed(2)}.`,
    '',
    ...(notJudged.length === 0
      ? ['Every row that ran was judged.']
      : ['Not judged on this runner (each must pass on the Prodesk for the head):', ...notJudged]),
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(judgedOnTheScreen(report));
  const above = stampLagAboveTheReviewed(report, REVIEWED_LAG.ci.p99Frames);
  if (above !== null) {
    process.stdout.write(`\n**${above}**\n`);
    process.stderr.write(`::error::${above}\n`);
    process.exitCode = 1;
  }
}
