#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaults = {
  baseline: 'regression/v2/api',
  recording: 'backend/build/api-transcripts',
  changes: 'regression/v2/changes',
  'inventory-baseline': 'regression/v2/test-inventory.json',
  inventory: '',
  report: '',
  changed: '',
};

const TRANSCRIPT_KINDS = [
  'status',
  'headers',
  'body',
  'request',
  'mails',
  'logs',
  'added',
  'removed',
];
const KINDS = [...TRANSCRIPT_KINDS, 'log-field', 'retired', 'shared-case'];
const NEEDS_SECURITY = new Set(['logs', 'log-field']);
const LISTED = 20;
const LISTED_LOG_LINES = 200;
const SHORT_NUMBER = 4;
const FOUNDATION_ADDRESS = 'info@nfnn.cz';
const BASELINE_FILES = [/^regression\/v2\/api\//, /^regression\/v2\/test-inventory\.json$/];
const SHARED_CASES = 'shared-cases/';
const WATCHED_FILES = [
  /^backend\/src\/test\/java\/.*\/transcript\//,
  /(?:^|\/)ApiTranscripts[^/]*$/,
  /^scripts\/compare-v2[^/]*\.mjs$/,
  /^\.github\/workflows\/pr-check\.yml$/,
  /^backend\/build\.gradle\.kts$/,
  /^regression\/v2\/BASELINE_COMMIT$/,
  /^scripts\/test-inventory\.mjs$/,
  /^mcp\/test\/backend-shapes[^/]*\.ts$/,
];
const UPPER_WORD = /\p{Lu}[\p{Lu}\d_]*/gu;
const SLOT = /<[a-z-]+(?::\d+)?>/g;

class InvalidInput extends Error {}

const posix = (path) => path.split(sep).join('/');
const shown = (value) =>
  typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? 'nic');
const shorten = (text, length = 160) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;
const REQUEST_ANCHOR =
  /^(?:GET|POST|PUT|PATCH|DELETE) (?:\/api\/(?:content|donors|donations|contact|operations|admin)\/|\/actuator\/|\/\.well-known\/|\/oauth)/;
const SCENARIO_ANCHOR = /^[a-z]+\/\w+: /;
const LOGGER_ANCHOR = /^[a-z]+\.[\w.]+:/;
const TEST_ANCHOR = /^[^*]+? > /;
const PATH_OPTIONAL = new Set(['removed']);
const PATH_REFUSED = new Set(['mails', 'logs']);
const withoutLevel = (line) => line.replace(/^\p{Lu}+ /u, '');

function options(argv) {
  const chosen = { ...defaults };
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)=(.*)$/);
    if (!match || !(match[1] in defaults)) {
      throw new InvalidInput(
        `Unknown option ${argument}; known: ${Object.keys(defaults)
          .map((name) => `--${name}=`)
          .join(', ')}`,
      );
    }
    chosen[match[1]] = match[2];
  }
  return chosen;
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (unreadable) {
    throw new InvalidInput(`${what} ${path} cannot be read as JSON: ${unreadable.message}`);
  }
}

function jsonFiles(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

function transcripts(directory, what) {
  if (!existsSync(directory)) {
    throw new InvalidInput(
      `The ${what} ${directory} does not exist; record it with API_TRANSCRIPTS=record (.claude/rules/testing.md, "Regression against v2")`,
    );
  }
  const features = new Map();
  for (const path of jsonFiles(directory)) {
    const file = readJson(path, `The ${what} file`);
    const feature = file.feature ?? posix(relative(directory, path)).replace(/\.json$/, '');
    features.set(feature, file.scenarios ?? {});
  }
  return features;
}

function glob(pattern) {
  const escaped = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.*')}$`, 's');
}

const exactly = (text) => ({ test: (candidate) => candidate === text });

function validatedSecurity(entry, problem) {
  if ('securityOk' in entry) {
    problem(
      'securityOk is gone: name the approval as security: {approvedIn: "<PR or review and date>", fields: {"<slot>": "what it holds"}}',
    );
  }
  if (!('security' in entry)) {
    if (NEEDS_SECURITY.has(entry.kind)) {
      problem(
        'a log change needs security: {approvedIn: "<PR or review and date>", fields: {"<slot>": "what it holds"}}, set once Jakub approved it (security.md, Logs)',
      );
    }
    return;
  }
  const { security } = entry;
  if (typeof security !== 'object' || security === null || Array.isArray(security)) {
    problem('security must be an object {approvedIn, fields}');
  }
  if (typeof security.approvedIn !== 'string' || security.approvedIn.trim() === '') {
    problem('security.approvedIn must name the PR or review and the date of the approval');
  }
  if (
    typeof security.fields !== 'object' ||
    security.fields === null ||
    Array.isArray(security.fields)
  ) {
    problem('security.fields must map every slot of the line, such as "<id>", to what it holds');
  }
  for (const [slot, meaning] of Object.entries(security.fields)) {
    if (typeof meaning !== 'string' || meaning.trim() === '') {
      problem(`security.fields["${slot}"] must say what the slot holds`);
    }
  }
}

function validated(entry, file, index) {
  const where = `${file} entry ${index + 1}`;
  const problem = (message) => {
    throw new InvalidInput(`${where}: ${message}`);
  };
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    problem('is not an object');
  }
  if (!KINDS.includes(entry.kind)) {
    problem(`kind ${shown(entry.kind)} is not one of ${KINDS.join(', ')}`);
  }
  if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
    problem('needs a reason naming the decision');
  }
  for (const field of [
    'path',
    'scenario',
    'line',
    'suite',
    'test',
    'replacement',
    'contract',
    'caseFile',
  ]) {
    if (field in entry && typeof entry[field] !== 'string') {
      problem(`${field} must be a string`);
    }
  }
  if (entry.kind === 'shared-case') {
    if (!entry.caseFile?.startsWith(SHARED_CASES)) {
      problem(
        'a changed shared case needs caseFile: the path from the repository root, starting with the literal "shared-cases/", * allowed after it',
      );
    }
    for (const field of ['path', 'scenario', 'line', 'suite', 'test', 'replacement']) {
      if (field in entry) {
        problem(`a changed shared case names its caseFile, not ${field}`);
      }
    }
    if (!entry.contract?.trim()) {
      problem('needs contract: the contract or overview section that describes the change');
    }
  } else if (entry.kind === 'retired') {
    for (const field of ['suite', 'test', 'replacement']) {
      if (!entry[field]?.trim()) {
        problem(
          `a retired test needs ${field}${field === 'replacement' ? ': the test that takes over, or why none does' : ''}`,
        );
      }
    }
    if (entry.suite.includes('*')) {
      problem('suite must be the literal suite name, without *');
    }
    if (!TEST_ANCHOR.test(entry.test)) {
      problem('test must start with its literal class or file and " > "');
    }
  } else if (entry.kind === 'log-field') {
    if (!entry.line?.trim() || entry.line.includes('*') || !LOGGER_ANCHOR.test(entry.line)) {
      problem(
        'a new log field needs line: the exact shape the report printed, starting with the logger name, without *',
      );
    }
    if ('scenario' in entry && !SCENARIO_ANCHOR.test(entry.scenario)) {
      problem('scenario must start with the literal "<context>/<feature>: "');
    }
  } else {
    if (PATH_REFUSED.has(entry.kind)) {
      if ('path' in entry) {
        problem(`${entry.kind} belong to the scenario, not to a request: drop path`);
      }
    } else if ('path' in entry || !PATH_OPTIONAL.has(entry.kind)) {
      if (!REQUEST_ANCHOR.test(entry.path ?? '')) {
        problem(
          'path must start with "METHOD /api/<context>/" (GET, POST, PUT, PATCH or DELETE; content, donors, donations, contact, operations or admin), "METHOD /actuator/", "METHOD /.well-known/" or "METHOD /oauth"',
        );
      }
    }
    if (!entry.scenario?.trim()) {
      problem('needs scenario: "<context>/<feature>: <scenario>", * allowed after the feature');
    }
    if (!SCENARIO_ANCHOR.test(entry.scenario)) {
      problem('scenario must start with the literal "<context>/<feature>: "');
    }
    if (entry.kind === 'logs' && !LOGGER_ANCHOR.test(entry.line ?? '')) {
      problem(
        'logs needs line: the v2 line without its level, starting with the literal logger name ("donors.application.X: …"), * allowed after it',
      );
    }
    if (!entry.contract?.trim()) {
      problem('needs contract: the contract or overview section that describes the change');
    }
  }
  validatedSecurity(entry, problem);
  return {
    ...entry,
    file,
    used: 0,
    matches: {
      path: glob(entry.path ?? '*'),
      scenario: glob(entry.scenario ?? '*'),
      line: entry.kind === 'log-field' ? exactly(entry.line) : glob(entry.line ?? '*'),
      suite: glob(entry.suite ?? '*'),
      test: glob(entry.test ?? '*'),
      caseFile: glob(entry.caseFile ?? '*'),
    },
  };
}

function declarations(directory) {
  if (!existsSync(directory)) {
    return { files: [], entries: [] };
  }
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const entries = files.flatMap((name) => {
    const list = readJson(join(directory, name), 'The change file');
    if (!Array.isArray(list)) {
      throw new InvalidInput(`${name} must hold a list of declarations`);
    }
    return list.map((entry, index) => validated(entry, name, index));
  });
  return { files, entries };
}

const template = (key) => key.replace(/ #\d+$/, '');

function declare(difference, entries) {
  const found = entries.find((entry) => {
    if (entry.kind !== difference.kind) {
      return false;
    }
    if (difference.kind === 'retired') {
      return entry.matches.suite.test(difference.suite) && entry.matches.test.test(difference.test);
    }
    if (difference.kind === 'log-field') {
      return (
        entry.matches.line.test(difference.line) && entry.matches.scenario.test(difference.scenario)
      );
    }
    if (!entry.matches.scenario.test(difference.scenario)) {
      return false;
    }
    if (difference.kind === 'logs') {
      return entry.matches.line.test(difference.baselineLine);
    }
    if (difference.kind === 'mails') {
      return true;
    }
    if (!('path' in entry) || difference.key === undefined) {
      return !('path' in entry) && difference.key === undefined;
    }
    return (
      entry.matches.path.test(template(difference.key)) || entry.matches.path.test(difference.key)
    );
  });
  if (found) {
    found.used += 1;
  }
  return found;
}

function bodyDifferences(baseline, recorded, path, out) {
  const kindOf = (value) =>
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (kindOf(baseline) !== kindOf(recorded)) {
    out.push(`${path}: ${shorten(shown(baseline), 80)} → ${shorten(shown(recorded), 80)}`);
    return;
  }
  if (kindOf(baseline) === 'object') {
    for (const [field, value] of Object.entries(baseline)) {
      if (!(field in recorded)) {
        out.push(`${path}.${field} odebráno (bylo ${shorten(shown(value), 80)})`);
      } else {
        bodyDifferences(value, recorded[field], `${path}.${field}`, out);
      }
    }
    return;
  }
  if (kindOf(baseline) === 'array') {
    if (baseline.length !== recorded.length) {
      out.push(`${path}: ${baseline.length} položek → ${recorded.length}`);
    }
    for (let index = 0; index < Math.min(baseline.length, recorded.length); index++) {
      bodyDifferences(baseline[index], recorded[index], `${path}[${index}]`, out);
    }
    return;
  }
  if (baseline !== recorded) {
    out.push(`${path}: ${shorten(shown(baseline), 80)} → ${shorten(shown(recorded), 80)}`);
  }
}

function addedFields(baseline, recorded, path, out) {
  if (baseline && recorded && typeof baseline === 'object' && typeof recorded === 'object') {
    if (Array.isArray(baseline) !== Array.isArray(recorded)) {
      return;
    }
    if (Array.isArray(baseline)) {
      for (let index = 0; index < Math.min(baseline.length, recorded.length); index++) {
        addedFields(baseline[index], recorded[index], `${path}[]`, out);
      }
      return;
    }
    for (const [field, value] of Object.entries(recorded)) {
      if (field in baseline) {
        addedFields(baseline[field], value, `${path}.${field}`, out);
      } else {
        out.add(`${path}.${field}`);
      }
    }
  }
}

const canonical = (value) => JSON.stringify(value);

function firstDifferingLine(baseline = '', recorded = '') {
  const before = String(baseline).split('\n');
  const after = String(recorded).split('\n');
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (before[index] !== after[index]) {
      return `řádek ${index + 1}: ${shorten(shown(before[index] ?? ''), 100)} → ${shorten(shown(after[index] ?? ''), 100)}`;
    }
  }
  return '';
}

function mailDifference(baseline, recorded) {
  const parts = [];
  for (const field of new Set([...Object.keys(baseline), ...Object.keys(recorded)])) {
    if (canonical(baseline[field]) === canonical(recorded[field])) {
      continue;
    }
    if (field === 'text') {
      parts.push(`text ${firstDifferingLine(baseline.text, recorded.text)}`);
    } else if (field === 'html') {
      parts.push(
        `html ${firstDifferingLine(baseline.html?.text, recorded.html?.text) || 'odkazy nebo kód se liší'}`,
      );
    } else {
      parts.push(
        `${field}: ${shorten(shown(baseline[field]), 80)} → ${shorten(shown(recorded[field]), 80)}`,
      );
    }
  }
  return parts.join('; ');
}

function unmatched(baseline, recorded) {
  const left = [...recorded];
  const missing = [];
  for (const item of baseline) {
    const index = left.findIndex((candidate) => canonical(candidate) === canonical(item));
    if (index < 0) {
      missing.push(item);
    } else {
      left.splice(index, 1);
    }
  }
  return { missing, extra: left };
}

function compareCall(scenario, key, baseline, recorded, differences, counts) {
  const at = { scenario, key };
  let changed = false;
  const push = (kind, detail) => {
    differences.push({ ...at, kind, detail });
    changed = true;
  };
  if (canonical(baseline.request) !== canonical(recorded.request)) {
    const parts = [];
    bodyDifferences(baseline.request ?? {}, recorded.request ?? {}, 'request', parts);
    const added = new Set();
    addedFields(baseline.request ?? {}, recorded.request ?? {}, 'request', added);
    push('request', [...parts, ...[...added].map((field) => `${field} přidáno`)].join('; '));
  }
  const before = baseline.response ?? {};
  const after = recorded.response ?? {};
  if (before.status !== after.status) {
    push('status', `${before.status} → ${after.status}`);
  }
  const headerParts = [];
  for (const [name, value] of Object.entries(before.headers ?? {})) {
    if (!(name in (after.headers ?? {}))) {
      headerParts.push(`${name} odebráno (bylo ${shown(value)})`);
    } else if (canonical(value) !== canonical(after.headers[name])) {
      headerParts.push(`${name}: ${shown(value)} → ${shown(after.headers[name])}`);
    }
  }
  if (headerParts.length > 0) {
    push('headers', headerParts.join('; '));
  }
  for (const name of Object.keys(after.headers ?? {})) {
    if (!(name in (before.headers ?? {}))) {
      counts.addedHeaders.add(`${name} (${template(key)})`);
    }
  }
  if ('body' in before && !('body' in after)) {
    push('body', 'tělo odpovědi odebráno');
  } else if ('body' in before) {
    const parts = [];
    bodyDifferences(before.body, after.body, '$', parts);
    if (parts.length > 0) {
      push('body', parts.join('; '));
    }
  }
  const fields = new Set();
  addedFields(before.body ?? {}, after.body ?? {}, '$', fields);
  if (!('body' in before) && 'body' in after) {
    fields.add('$');
  }
  for (const field of fields) {
    counts.addedFields.add(`${template(key)} ${field}`);
  }
  return changed;
}

function enumWords(baseline) {
  const words = new Set();
  for (const scenarios of baseline.values()) {
    for (const scenario of Object.values(scenarios)) {
      for (const line of scenario.logs ?? []) {
        for (const [word] of line
          .replace(/^\p{Lu}+ /u, '')
          .replace(/<[^>]*>/g, ' ')
          .matchAll(UPPER_WORD)) {
          if (word.length > 1) {
            words.add(word);
          }
        }
      }
    }
  }
  return words;
}

export function logShaper(enums) {
  return (line) =>
    withoutLevel(line)
      .replace(/<([a-z-]+):[^>]*>/g, '<$1>')
      .replace(/\d+/g, (digits) =>
        digits.length <= SHORT_NUMBER ? '<n>' : `<digits:${digits.length}>`,
      )
      .replace(UPPER_WORD, (word) =>
        word.length > 1 && (word.includes('_') || enums.has(word)) ? '<enum>' : word,
      )
      .replace(/<enum>(?:, <enum>)+/g, '<enum>, …');
}

const slotsOf = (shape) => [...new Set(shape.match(SLOT) ?? [])].sort();

function recipientKind(mail) {
  const recipients = [...(mail.to ?? []), ...(mail.cc ?? []), ...(mail.bcc ?? [])];
  return [
    ...new Set(
      recipients.map((address) => (address.includes(FOUNDATION_ADDRESS) ? 'fond' : 'dárce')),
    ),
  ].join(', ');
}

function addedLog(counts, scenario, line) {
  const known = counts.addedLogLines.get(line);
  counts.addedLogLines.set(line, {
    scenario: known?.scenario ?? scenario,
    count: (known?.count ?? 0) + 1,
  });
}

function addedMail(counts, scenario, mail) {
  counts.addedMails.push(
    `${scenario}: „${String(mail.subject ?? '').replace(/\d+/g, '<n>')}“ → ${recipientKind(mail)}`,
  );
}

function compareScenario(scenario, baseline, recorded, differences, counts, shape) {
  let changed = false;
  for (const [key, call] of Object.entries(baseline.requests ?? {})) {
    const recordedCall = recorded.requests?.[key];
    if (!recordedCall) {
      differences.push({ scenario, key, kind: 'removed', detail: 'požadavek odebrán' });
      counts.requests.removed += 1;
      changed = true;
    } else if (compareCall(scenario, key, call, recordedCall, differences, counts)) {
      counts.requests.changed += 1;
      changed = true;
    } else {
      counts.requests.unchanged += 1;
    }
  }
  for (const key of Object.keys(recorded.requests ?? {})) {
    if (!(key in (baseline.requests ?? {}))) {
      counts.requests.added += 1;
      counts.addedRequests.push(`${scenario} · ${key}`);
      counts.addedPairs.push({ scenario, path: template(key) });
    }
  }

  const mails = unmatched(baseline.mails ?? [], recorded.mails ?? []);
  counts.mails.unchanged += (baseline.mails ?? []).length - mails.missing.length;
  for (const mail of mails.missing) {
    const index = mails.extra.findIndex((candidate) => candidate.subject === mail.subject);
    const partner = index >= 0 ? mails.extra.splice(index, 1)[0] : undefined;
    differences.push({
      scenario,
      kind: 'mails',
      detail: partner
        ? `změněno „${mail.subject}“: ${mailDifference(mail, partner)}`
        : `odebráno „${mail.subject}“ (${recipientKind(mail)})`,
    });
    counts.mails[partner ? 'changed' : 'removed'] += 1;
    changed = true;
  }
  counts.mails.added += mails.extra.length;
  mails.extra.forEach((mail) => addedMail(counts, scenario, mail));

  const logs = unmatched(baseline.logs ?? [], recorded.logs ?? []);
  counts.logs.unchanged += (baseline.logs ?? []).length - logs.missing.length;
  for (const line of logs.missing) {
    const index = logs.extra.findIndex((candidate) => shape(candidate) === shape(line));
    const partner = index >= 0 ? logs.extra.splice(index, 1)[0] : undefined;
    differences.push({
      scenario,
      kind: 'logs',
      baselineLine: withoutLevel(line),
      slots: partner === undefined ? [] : slotsOf(shape(partner)),
      detail: partner ? `změněno ${shown(line)} → ${shown(partner)}` : `odebráno ${shown(line)}`,
    });
    if (partner !== undefined) {
      counts.changedLogLines.push(`${scenario}: ${shown(line)} → ${shown(partner)}`);
    }
    counts.logs[partner ? 'changed' : 'removed'] += 1;
    changed = true;
  }
  counts.logs.added += logs.extra.length;
  logs.extra.forEach((line) => addedLog(counts, scenario, line));
  return changed;
}

function emptyCounts() {
  const tally = () => ({ unchanged: 0, changed: 0, added: 0, removed: 0 });
  return {
    scenarios: tally(),
    requests: tally(),
    mails: tally(),
    logs: tally(),
    tests: tally(),
    addedRequests: [],
    addedPairs: [],
    addedScenarios: [],
    addedFields: new Set(),
    addedHeaders: new Set(),
    addedMails: [],
    addedLogLines: new Map(),
    changedLogLines: [],
    addedTests: [],
    newLogFields: 0,
  };
}

function compareTranscripts(baseline, recording, differences, counts) {
  const shape = logShaper(enumWords(baseline));
  const knownShapes = new Set();
  for (const scenarios of baseline.values()) {
    for (const scenario of Object.values(scenarios)) {
      (scenario.logs ?? []).forEach((line) => knownShapes.add(shape(line)));
    }
  }
  for (const [feature, scenarios] of baseline) {
    const recordedScenarios = recording.get(feature) ?? {};
    for (const [name, scenario] of Object.entries(scenarios)) {
      const label = `${feature}: ${name}`;
      if (!(name in recordedScenarios)) {
        differences.push({ scenario: label, kind: 'removed', detail: 'scénář odebrán' });
        counts.scenarios.removed += 1;
      } else if (
        compareScenario(label, scenario, recordedScenarios[name], differences, counts, shape)
      ) {
        counts.scenarios.changed += 1;
      } else {
        counts.scenarios.unchanged += 1;
      }
    }
  }
  for (const [feature, scenarios] of recording) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      if (!(name in (baseline.get(feature) ?? {}))) {
        const label = `${feature}: ${name}`;
        counts.scenarios.added += 1;
        counts.addedScenarios.push(label);
        counts.requests.added += Object.keys(scenario.requests ?? {}).length;
        Object.keys(scenario.requests ?? {}).forEach((key) =>
          counts.addedPairs.push({ scenario: label, path: template(key) }),
        );
        counts.mails.added += (scenario.mails ?? []).length;
        (scenario.mails ?? []).forEach((mail) => addedMail(counts, label, mail));
        counts.logs.added += (scenario.logs ?? []).length;
        (scenario.logs ?? []).forEach((line) => addedLog(counts, label, line));
      }
    }
  }
  const reported = new Set();
  for (const [feature, scenarios] of recording) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      for (const line of scenario.logs ?? []) {
        const lineShape = shape(line);
        if (!knownShapes.has(lineShape) && !reported.has(lineShape)) {
          reported.add(lineShape);
          differences.push({
            scenario: `${feature}: ${name}`,
            kind: 'log-field',
            line: lineShape,
            slots: slotsOf(lineShape),
            detail: `nový tvar řádku logu ${shown(lineShape)}`,
          });
          counts.newLogFields += 1;
        }
      }
    }
  }
}

function compareInventory(baseline, fresh, differences, counts) {
  for (const [suite, tests] of Object.entries(baseline.suites ?? {})) {
    const now = new Set(fresh.suites?.[suite] ?? []);
    for (const test of tests) {
      if (now.has(test)) {
        counts.tests.unchanged += 1;
      } else {
        differences.push({
          kind: 'retired',
          suite,
          test,
          detail: `test zmizel: ${suite} › ${test}`,
        });
        counts.tests.removed += 1;
      }
    }
  }
  for (const [suite, tests] of Object.entries(fresh.suites ?? {})) {
    const before = new Set(baseline.suites?.[suite] ?? []);
    for (const test of tests.filter((name) => !before.has(name))) {
      counts.tests.added += 1;
      counts.addedTests.push(`${suite} › ${test}`);
    }
  }
}

export function changedPaths(paths) {
  const relativePaths = paths
    .map((path) => path.trim())
    .filter((path) => path !== '')
    .map((path) => (isAbsolute(path) ? posix(relative(root, path)) : posix(path)));
  return {
    all: new Set(paths.map((path) => resolve(root, path.trim()))),
    baseline: relativePaths.filter((path) => BASELINE_FILES.some((rule) => rule.test(path))),
    watched: relativePaths.filter((path) => WATCHED_FILES.some((rule) => rule.test(path))),
    sharedCases: relativePaths.filter((path) => path.startsWith(SHARED_CASES)),
  };
}

function where(difference) {
  if (difference.kind === 'retired') {
    return `${difference.suite} › ${difference.test}`;
  }
  return difference.key ? `${difference.scenario} · \`${difference.key}\`` : difference.scenario;
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function list(items, empty, limit = LISTED) {
  if (items.length === 0) {
    return [`- ${empty}`];
  }
  const lines = items.slice(0, limit).map((item) => `- ${cell(item)}`);
  if (items.length > limit) {
    lines.push(`- … a dalších ${items.length - limit}`);
  }
  return lines;
}

const describeEntry = (entry) =>
  `${entry.file}: \`${entry.kind}\` ${entry.path ?? entry.line ?? entry.test ?? entry.caseFile ?? ''} ${entry.scenario ?? entry.suite ?? ''}`.trim();

function render(result) {
  const {
    chosen,
    counts,
    errors,
    declared,
    entries,
    files,
    inventoryChecked,
    changed,
    sharedCases,
  } = result;
  const relativeToRoot = (path) => posix(relative(root, resolve(root, path))) || '.';
  const lines = ['## Srovnání s v2', ''];
  lines.push(
    `Nahrávka \`${relativeToRoot(chosen.recording)}\` proti \`${relativeToRoot(chosen.baseline)}\`; deklarace z \`${relativeToRoot(chosen.changes)}\`: ${files.length} souborů, ${entries.length} položek.`,
    '',
  );
  lines.push(
    errors.length === 0
      ? '**Žádný nedeklarovaný rozdíl.**'
      : `**${errors.length} chyb: srovnání neprošlo.**`,
    '',
  );
  const row = (name, tally) =>
    `| ${name} | ${tally.unchanged} | ${tally.changed} | ${tally.added} | ${tally.removed} |`;
  lines.push('| Kontrola | Beze změny | Změněno | Přidáno | Odebráno |', '|---|---|---|---|---|');
  lines.push(
    row('Scénáře', counts.scenarios),
    row('Požadavky HTTP', counts.requests),
    row('E-maily', counts.mails),
    row('Řádky logu', counts.logs),
  );
  lines.push(`| Nové tvary řádků logu | – | – | ${counts.newLogFields} | – |`);
  lines.push(
    inventoryChecked
      ? row('Testy (inventář)', counts.tests)
      : '| Testy (inventář) | neprovedeno | | | |',
  );
  lines.push('');
  lines.push('### Nedeklarované rozdíly a chyby', '');
  lines.push(
    ...list(
      errors.map((error) => error.report),
      'žádné',
      errors.length,
    ),
    '',
  );
  if (changed) {
    lines.push('### Změny nahrávání a srovnání', '');
    lines.push(
      ...list(
        changed.watched.map((path) => `\`${path}\``),
        'žádné: nahrávání, maskování ani srovnání se nemění',
        changed.watched.length,
      ),
      '',
    );
  }
  if (changed) {
    lines.push('### Změněné sdílené případy', '');
    lines.push(
      ...list(
        sharedCases.map(
          ({ path, entry }) =>
            `\`${path}\`: ${entry.reason} (${entry.file}${entry.contract ? `; ${entry.contract}` : ''})`,
        ),
        'žádné',
        sharedCases.length,
      ),
      '',
    );
  }
  lines.push('### Schváleno bezpečností', '');
  const approved = entries.filter((entry) => entry.security);
  lines.push(
    ...list(
      approved.map(
        (entry) =>
          `${describeEntry(entry)}; schváleno v ${entry.security.approvedIn}; pole: ${
            Object.entries(entry.security.fields)
              .map(([slot, meaning]) => `\`${slot}\` = ${meaning}`)
              .join(', ') || 'žádná'
          }; použito ${entry.used}×`,
      ),
      'žádné',
      approved.length,
    ),
    '',
  );
  lines.push('### Změněné a přidané řádky logu', '');
  const logLines = [
    ...counts.changedLogLines.map((line) => `změněno ${line}`),
    ...[...counts.addedLogLines].map(
      ([line, { scenario, count }]) => `přidáno ${shown(line)} (${count}×, poprvé v ${scenario})`,
    ),
  ];
  lines.push(...list(logLines, 'žádné', LISTED_LOG_LINES), '');
  lines.push('### Deklarované rozdíly', '');
  if (declared.length === 0) {
    lines.push('- žádné', '');
  } else {
    lines.push('| Soubor | Druh | Kde | Rozdíl | Důvod |', '|---|---|---|---|---|');
    for (const { difference, entry } of declared.slice(0, 200)) {
      const reason =
        entry.kind === 'retired' ? `${entry.reason} (náhrada: ${entry.replacement})` : entry.reason;
      lines.push(
        `| ${entry.file} | \`${difference.kind}\` | ${cell(where(difference))} | ${cell(shorten(difference.detail, 200))} | ${cell(reason)}${entry.contract ? ` (${cell(entry.contract)})` : ''} |`,
      );
    }
    if (declared.length > 200) {
      lines.push(`| … | | | a dalších ${declared.length - 200} | |`);
    }
    lines.push('');
  }
  lines.push('### Přidáno', '');
  lines.push(
    `Scénáře (${counts.addedScenarios.length}):`,
    ...list(counts.addedScenarios, 'žádné'),
    '',
  );
  lines.push(
    `Požadavky ve stávajících scénářích (${counts.addedRequests.length}):`,
    ...list(counts.addedRequests, 'žádné'),
    '',
  );
  lines.push(
    `Pole v odpovědích (${counts.addedFields.size}):`,
    ...list([...counts.addedFields].sort(), 'žádná'),
    '',
  );
  lines.push(
    `Hlavičky odpovědí (${counts.addedHeaders.size}):`,
    ...list([...counts.addedHeaders].sort(), 'žádné'),
    '',
  );
  lines.push(`E-maily (${counts.addedMails.length}):`, ...list(counts.addedMails, 'žádné'), '');
  if (inventoryChecked) {
    lines.push(`Testy (${counts.addedTests.length}):`, ...list(counts.addedTests, 'žádné'), '');
  }
  const unused = entries.filter((entry) => entry.used === 0);
  lines.push('### Nepoužité deklarace', '');
  lines.push(
    ...list(
      unused.map(
        (entry) =>
          `${describeEntry(entry)}${entry.changedInPr ? ' (soubor mění tento PR: chyba)' : ' (starší soubor: jen upozornění)'}`,
      ),
      'žádné',
      unused.length,
    ),
  );
  lines.push('');
  return lines.join('\n');
}

export function run(argv) {
  const chosen = options(argv);
  const at = (path) => resolve(root, path);
  const changesDirectory = at(chosen.changes);
  const { files, entries } = declarations(changesDirectory);
  const changed =
    chosen.changed === ''
      ? undefined
      : changedPaths(readFileSync(at(chosen.changed), 'utf8').split('\n'));
  for (const entry of entries) {
    entry.changedInPr = changed?.all.has(join(changesDirectory, entry.file)) ?? false;
  }
  const baseline = transcripts(at(chosen.baseline), 'baseline');
  const recording = transcripts(at(chosen.recording), 'recording');
  const differences = [];
  const counts = emptyCounts();
  compareTranscripts(baseline, recording, differences, counts);
  const inventoryChecked = chosen.inventory !== '';
  if (inventoryChecked) {
    compareInventory(
      readJson(at(chosen['inventory-baseline']), 'The baseline test inventory'),
      readJson(at(chosen.inventory), 'The test inventory'),
      differences,
      counts,
    );
  }
  const errors = [];
  const declared = [];
  for (const path of changed?.baseline ?? []) {
    errors.push({
      report: `\`baseline\` ${path}: tento PR mění základ v2, který se nikdy nepřegeneruje; deklarujte rozdíl v \`regression/v2/changes/\``,
      error: `the pull request changes the v2 baseline file ${path}; declare the difference in regression/v2/changes/ instead`,
    });
  }
  const sharedCases = [];
  for (const path of changed?.sharedCases ?? []) {
    const entry = entries.find(
      (candidate) => candidate.kind === 'shared-case' && candidate.matches.caseFile.test(path),
    );
    if (!entry) {
      errors.push({
        report: `\`shared-case\` ${path}: tento PR mění sdílené případy bez deklarace; pojmenujte soubor v \`regression/v2/changes/\``,
        error: `the pull request changes ${path} without a shared-case declaration in regression/v2/changes/ naming it`,
      });
      continue;
    }
    entry.used += 1;
    sharedCases.push({ path, entry });
  }
  for (const difference of differences) {
    const entry = declare(difference, entries);
    if (!entry) {
      errors.push({
        report: `\`${difference.kind}\` ${where(difference)}: ${difference.detail}`,
        error: `undeclared ${difference.kind} difference at ${where(difference)}: ${difference.detail}`,
      });
      continue;
    }
    const missing = (difference.slots ?? []).filter(
      (slot) => !(entry.security && slot in entry.security.fields),
    );
    if (missing.length > 0) {
      errors.push({
        report: `\`${difference.kind}\` ${where(difference)}: ${difference.detail}; schválení v ${entry.file} neříká, co drží ${missing.join(', ')}`,
        error: `the approval in ${entry.file} does not say what ${missing.join(', ')} holds in ${difference.line ?? difference.detail}`,
      });
      continue;
    }
    declared.push({ difference, entry });
  }
  for (const entry of entries.filter((candidate) => candidate.kind === 'added')) {
    entry.used = counts.addedPairs.filter(
      (pair) => entry.matches.scenario.test(pair.scenario) && entry.matches.path.test(pair.path),
    ).length;
  }
  for (const entry of entries.filter(
    (candidate) => candidate.used === 0 && candidate.changedInPr,
  )) {
    errors.push({
      report: `nepoužitá deklarace ${describeEntry(entry)}: soubor mění tento PR, takže musí pokrýt skutečný rozdíl`,
      error: `the declaration ${describeEntry(entry)} is unused, and its file ${entry.file} is part of this pull request`,
    });
  }
  const report = render({
    chosen,
    counts,
    errors,
    declared,
    entries,
    files,
    inventoryChecked,
    changed,
    sharedCases,
  });
  return { report, errors, output: chosen.report === '' ? '' : at(chosen.report) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { report, errors, output } = run(process.argv.slice(2));
    if (output !== '') {
      writeFileSync(output, `${report}\n`);
    }
    console.log(report);
    for (const { error } of errors) {
      console.error(`::error::${error}`);
    }
    process.exit(errors.length === 0 ? 0 : 1);
  } catch (failure) {
    if (failure instanceof InvalidInput) {
      console.error(`::error::${failure.message}`);
      process.exit(2);
    }
    throw failure;
  }
}
