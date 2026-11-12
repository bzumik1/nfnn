export const REBASE_LABEL = 'needs-rebase';

const SIZES = [
  { name: 'size:XS', below: 10, color: '0e8a16', range: '0-9' },
  { name: 'size:S', below: 30, color: '5ebd3e', range: '10-29' },
  { name: 'size:M', below: 100, color: 'fbca04', range: '30-99' },
  { name: 'size:L', below: 500, color: 'fe7d37', range: '100-499' },
  { name: 'size:XL', below: 1000, color: 'd93f0b', range: '500-999' },
  { name: 'size:XXL', below: Infinity, color: 'b60205', range: '1,000+' },
];

export const MANAGED_LABELS = [
  { name: REBASE_LABEL, color: 'e99695', description: 'The pull request conflicts with main: rebase it onto origin/main.' },
  ...SIZES.map(({ name, color, range }) => ({
    name,
    color,
    description: `${range} changed lines, without lock files, recordings and, in a change with code, tests.`,
  })),
];

const SIZE_NAMES = new Set(SIZES.map(({ name }) => name));
const TEST_FILE = /(?:^|\/)(?:src\/test|e2e|test)\/|\.(?:spec|test)\.[cm]?[jt]sx?$|Tests?\.(?:java|kt)$|\.feature$/;
const NEVER_COUNTED = /(?:^|\/)(?:package-lock\.json|gradle\.lockfile|[^/]+\.lock)$|^regression\/v2\//;
const MAX_REQUESTS_PER_RUN = 50;
const MERGEABLE_WAIT_MS = 150_000;
const WRITE_PAUSE_MS = 1_000;
const READ_ATTEMPTS = 4;
const READ_RETRY_MS = 5_000;

const OPEN_PULL_REQUESTS = `
  query ($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, baseRefName: "main", first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          mergeable
          baseRefName
          labels(first: 100) { nodes { name } }
        }
      }
    }
  }`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function sizeLabelOf(files) {
  const counted = files.filter(({ filename }) => !NEVER_COUNTED.test(filename));
  const code = counted.filter(({ filename }) => !TEST_FILE.test(filename));
  const lines = (code.length > 0 ? code : counted).reduce((sum, { additions, deletions }) => sum + additions + deletions, 0);
  return SIZES.find(({ below }) => lines < below).name;
}

export function decide(pr) {
  const labelled = pr.labels.nodes.some(({ name }) => name === REBASE_LABEL);
  if (pr.mergeable === 'CONFLICTING') return labelled ? 'skip' : 'request-rebase';
  if (pr.mergeable === 'MERGEABLE' && labelled) return 'clear-rebase';
  return 'skip';
}

async function read(github, pause, query, variables) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await github.graphql(query, variables);
    } catch (error) {
      const transient = typeof error.status === 'number' && error.status >= 500;
      if (attempt === READ_ATTEMPTS || !transient) throw error;
      await pause(attempt * READ_RETRY_MS);
    }
  }
}

async function removeLabel(github, context, number, name) {
  try {
    await github.rest.issues.removeLabel({ ...context.repo, issue_number: number, name });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

export async function syncSizeLabel({ github, context, core }) {
  const number = context.payload.pull_request.number;
  const files = await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: number, per_page: 100 });
  const wanted = sizeLabelOf(files);
  const current = await github.paginate(github.rest.issues.listLabelsOnIssue, { ...context.repo, issue_number: number, per_page: 100 });
  for (const { name } of current) {
    if (SIZE_NAMES.has(name) && name !== wanted) await removeLabel(github, context, number, name);
  }
  if (!current.some(({ name }) => name === wanted)) {
    await github.rest.issues.addLabels({ ...context.repo, issue_number: number, labels: [wanted] });
  }
  core.info(`PR #${number}: ${wanted}`);
}

export async function sweep({ github, context, core, pause = sleep }) {
  const list = async () => {
    const prs = [];
    for (let cursor = null; ;) {
      const page = (await read(github, pause, OPEN_PULL_REQUESTS, { ...context.repo, cursor })).repository.pullRequests;
      prs.push(...page.nodes);
      if (!page.pageInfo.hasNextPage) return prs;
      cursor = page.pageInfo.endCursor;
    }
  };
  let prs = await list();
  if (prs.some(({ mergeable }) => mergeable === 'UNKNOWN')) {
    await pause(MERGEABLE_WAIT_MS);
    prs = await list();
  }

  const count = {};
  for (const pr of prs) {
    const action = decide(pr);
    if (action === 'skip') continue;
    if (action === 'request-rebase' && (count[action] ?? 0) >= MAX_REQUESTS_PER_RUN) continue;
    count[action] = (count[action] ?? 0) + 1;
    core.info(`#${pr.number} ${action}`);
    if (action === 'request-rebase') {
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: pr.number,
        body: [
          `This PR conflicts with \`${pr.baseRefName}\`. Rebase it onto \`origin/${pr.baseRefName}\`, resolve the conflict and push with \`--force-with-lease\`; GitHub runs no checks on a conflicting PR.`,
          '',
          `The \`${REBASE_LABEL}\` label goes by itself once the PR merges cleanly again.`,
        ].join('\n'),
      });
      await github.rest.issues.addLabels({ ...context.repo, issue_number: pr.number, labels: [REBASE_LABEL] });
    } else {
      await removeLabel(github, context, pr.number, REBASE_LABEL);
    }
    await pause(WRITE_PAUSE_MS);
  }
  const summary = Object.entries(count).map(([action, n]) => `${n} ${action}`);
  core.info(`${prs.length} PRs read: ${summary.join(', ') || 'nothing to do'}.`);
  return count;
}

export async function syncLabels({ github, context }) {
  for (const label of MANAGED_LABELS) {
    try {
      const { data: existing } = await github.rest.issues.getLabel({ ...context.repo, name: label.name });
      if (existing.color !== label.color || (existing.description ?? '') !== label.description) {
        await github.rest.issues.updateLabel({ ...context.repo, ...label });
      }
    } catch (error) {
      if (error.status !== 404) throw error;
      await github.rest.issues.createLabel({ ...context.repo, ...label });
    }
  }
}
