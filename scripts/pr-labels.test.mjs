import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MANAGED_LABELS, REBASE_LABEL, clearSettledRebase, decide, sizeLabelOf, sweep, syncLabels, syncSizeLabel } from './pr-labels.mjs';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const quiet = { info() {}, notice() {}, warning() {} };
const context = { repo: { owner: 'bzumik1', repo: 'nfnn' } };

const openPr = ({ number = 7, labels = [], mergeable = 'CONFLICTING' } = {}) => ({
  number,
  mergeable,
  baseRefName: 'main',
  labels: { nodes: labels.map((name) => ({ name })) },
});

const fakeGithub = ({ pages = [[]], labelsOnIssue = [], existingLabels = {}, prFiles = [], mergeable = [true] } = {}) => {
  const writes = [];
  let listed = 0;
  let fetched = 0;
  return {
    writes,
    listed: () => listed,
    fetched: () => fetched,
    async graphql() {
      const nodes = pages[Math.min(listed, pages.length - 1)];
      listed += 1;
      return { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
    },
    paginate: async (method, params) => (await method(params)).data,
    rest: {
      issues: {
        createComment: async (params) => writes.push(['comment', params.issue_number, params.body]),
        addLabels: async (params) => writes.push(['label', params.issue_number, params.labels.join(',')]),
        removeLabel: async (params) => writes.push(['unlabel', params.issue_number, params.name]),
        listLabelsOnIssue: async () => ({ data: labelsOnIssue.map((name) => ({ name })) }),
        getLabel: async ({ name }) => {
          if (!(name in existingLabels)) throw Object.assign(new Error('Not Found'), { status: 404 });
          return { data: existingLabels[name] };
        },
        createLabel: async (params) => writes.push(['create-label', params.name, params.color]),
        updateLabel: async (params) => writes.push(['update-label', params.name, params.color]),
      },
      pulls: {
        listFiles: async () => ({ data: prFiles }),
        get: async () => {
          const value = mergeable[Math.min(fetched, mergeable.length - 1)];
          fetched += 1;
          return { data: { mergeable: value } };
        },
      },
    },
  };
};
const options = (github) => ({ github, context, core: quiet, now: NOW, pause: async () => {} });

describe('Given the changed files of a pull request', () => {
  const file = (filename, changes) => ({ filename, additions: changes, deletions: 0 });

  it('when code and tests change together, then only the code counts towards the size', () => {
    assert.equal(sizeLabelOf([file('backend/src/main/A.java', 8), file('backend/src/test/java/ATest.java', 400)]), 'size:XS');
  });

  it('when only tests change, then the tests count', () => {
    assert.equal(sizeLabelOf([file('frontend/e2e/a.spec.ts', 40), file('backend/src/test/resources/features/a.feature', 2)]), 'size:M');
  });

  it('when lock files and recordings change, then they never count', () => {
    const changed = [file('frontend/package-lock.json', 5000), file('regression/v2/api/a.json', 900), file('regression/v2/changes/599.json', 3), file('docs/roadmap.md', 12)];
    assert.equal(sizeLabelOf(changed), 'size:S');
  });

  it('when the counted lines cross each boundary, then the label follows the scale of T3 Code', () => {
    const at = (lines) => sizeLabelOf([file('a.ts', lines)]);
    assert.deepEqual([0, 9, 10, 29, 30, 99, 100, 499, 500, 999, 1000].map(at), [
      'size:XS', 'size:XS', 'size:S', 'size:S', 'size:M', 'size:M', 'size:L', 'size:L', 'size:XL', 'size:XL', 'size:XXL',
    ]);
  });
});

describe('Given the size label of a pull request', () => {
  const event = { ...context, payload: { pull_request: { number: 12 } } };

  it('when the size changed, then the old size label goes and the new one comes, and other labels stay', async () => {
    const github = fakeGithub({ labelsOnIssue: ['size:L', 'bug'], prFiles: [{ filename: 'a.ts', additions: 3, deletions: 1 }] });
    await syncSizeLabel({ ...options(github), context: event });
    assert.deepEqual(github.writes, [['unlabel', 12, 'size:L'], ['label', 12, 'size:XS']]);
  });

  it('when it already matches, then nothing is written', async () => {
    const github = fakeGithub({ labelsOnIssue: ['size:XS'], prFiles: [{ filename: 'a.ts', additions: 1, deletions: 0 }] });
    await syncSizeLabel({ ...options(github), context: event });
    assert.deepEqual(github.writes, []);
  });
});

describe('Given a push to a pull request that carries the rebase label', () => {
  const event = { ...context, payload: { pull_request: { number: 12 } } };

  it('when GitHub finds it merges cleanly, then the label goes at once', async () => {
    const github = fakeGithub({ labelsOnIssue: [REBASE_LABEL, 'size:S'], mergeable: [true] });
    await clearSettledRebase({ ...options(github), context: event });
    assert.deepEqual(github.writes, [['unlabel', 12, REBASE_LABEL]]);
  });

  it('when GitHub is still computing, then it asks again and clears the label once it merges cleanly', async () => {
    const github = fakeGithub({ labelsOnIssue: [REBASE_LABEL], mergeable: [null, null, true] });
    await clearSettledRebase({ ...options(github), context: event });
    assert.equal(github.fetched(), 3);
    assert.deepEqual(github.writes, [['unlabel', 12, REBASE_LABEL]]);
  });

  it('when it still conflicts, then the label stays', async () => {
    const github = fakeGithub({ labelsOnIssue: [REBASE_LABEL], mergeable: [false] });
    await clearSettledRebase({ ...options(github), context: event });
    assert.deepEqual(github.writes, []);
  });

  it('when GitHub never settles, then it gives up after a bounded number of reads and leaves the label for the sweep', async () => {
    const github = fakeGithub({ labelsOnIssue: [REBASE_LABEL], mergeable: [null] });
    await clearSettledRebase({ ...options(github), context: event });
    assert.equal(github.fetched(), 6);
    assert.deepEqual(github.writes, []);
  });

  it('when the label is not there, then nothing is read or written', async () => {
    const github = fakeGithub({ labelsOnIssue: ['size:S'], mergeable: [true] });
    await clearSettledRebase({ ...options(github), context: event });
    assert.equal(github.fetched(), 0);
    assert.deepEqual(github.writes, []);
  });
});

describe('Given the conflict policy', () => {
  it('when a pull request conflicts without the label, then it is asked to rebase', () => {
    assert.equal(decide(openPr()), 'request-rebase');
  });

  it('when it carries the label and still conflicts, then it is asked only once', () => {
    assert.equal(decide(openPr({ labels: [REBASE_LABEL] })), 'skip');
  });

  it('when it carries the label and merges cleanly again, then the label goes', () => {
    assert.equal(decide(openPr({ labels: [REBASE_LABEL], mergeable: 'MERGEABLE' })), 'clear-rebase');
  });

  it('when mergeability is not known yet, then nothing happens', () => {
    assert.equal(decide(openPr({ mergeable: 'UNKNOWN' })), 'skip');
    assert.equal(decide(openPr({ labels: [REBASE_LABEL], mergeable: 'UNKNOWN' })), 'skip');
  });
});

describe('Given open pull requests on the sweep', () => {
  it('when one conflicts, then the label comes before the comment that wakes its watchers, so a failed comment is never repeated', async () => {
    const github = fakeGithub({ pages: [[openPr({ number: 5 }), openPr({ number: 6, mergeable: 'MERGEABLE' })]] });
    const counts = await sweep(options(github));
    assert.deepEqual(github.writes.map(([kind, number]) => [kind, number]), [['label', 5], ['comment', 5]]);
    assert.match(github.writes[1][2], /conflicts with `main`/);
    assert.match(github.writes[1][2], /rebase/i);
    assert.deepEqual(counts, { 'request-rebase': 1 });
  });

  it('when one is resolved, then only its label goes, without a comment', async () => {
    const github = fakeGithub({ pages: [[openPr({ number: 8, labels: [REBASE_LABEL], mergeable: 'MERGEABLE' })]] });
    await sweep(options(github));
    assert.deepEqual(github.writes, [['unlabel', 8, REBASE_LABEL]]);
  });

  it('when GitHub has not computed mergeability yet, then the sweep waits and reads the list once more', async () => {
    const waits = [];
    const github = fakeGithub({ pages: [[openPr({ number: 9, mergeable: 'UNKNOWN' })], [openPr({ number: 9 })]] });
    await sweep({ ...options(github), pause: async (ms) => waits.push(ms) });
    assert.equal(github.listed(), 2);
    assert.ok(waits[0] >= 60_000);
    assert.deepEqual(github.writes.map(([kind]) => kind), ['label', 'comment']);
  });

  it('when a write to one pull request fails, then the sweep warns and goes on with the next', async () => {
    const warnings = [];
    const github = fakeGithub({ pages: [[openPr({ number: 3 }), openPr({ number: 4 })]] });
    const addLabels = github.rest.issues.addLabels;
    github.rest.issues.addLabels = async (params) => {
      if (params.issue_number === 3) throw Object.assign(new Error('Unprocessable'), { status: 422 });
      return addLabels(params);
    };
    await sweep({ ...options(github), core: { ...quiet, warning: (text) => warnings.push(text) } });
    assert.deepEqual(github.writes.map(([kind, number]) => [kind, number]), [['label', 4], ['comment', 4]]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /#3/);
  });

  it('when more pull requests conflict than one run may ask, then the rest wait for the next run', async () => {
    const many = Array.from({ length: 60 }, (_, index) => openPr({ number: index + 1 }));
    const github = fakeGithub({ pages: [many] });
    const counts = await sweep(options(github));
    assert.equal(counts['request-rebase'], 50);
  });
});

describe('Given the managed labels', () => {
  it('when one is missing and one has another colour, then the first is created and the second updated', async () => {
    const [first, second, ...rest] = MANAGED_LABELS;
    const existing = Object.fromEntries([[second.name, { ...second, color: '000000' }], ...rest.map((label) => [label.name, label])]);
    const github = fakeGithub({ existingLabels: existing });
    await syncLabels(options(github));
    assert.deepEqual(github.writes, [['create-label', first.name, first.color], ['update-label', second.name, second.color]]);
  });

  it('when the list is read, then it holds the rebase label and every size label', () => {
    assert.deepEqual(MANAGED_LABELS.map(({ name }) => name), [REBASE_LABEL, 'size:XS', 'size:S', 'size:M', 'size:L', 'size:XL', 'size:XXL']);
  });
});
