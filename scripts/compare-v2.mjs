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
  main: '',
  'main-commit': '',
  'main-changed': '',
  'main-missing': '',
  'baseline-commit': 'regression/v2/BASELINE_COMMIT',
  'main-inventory': '',
  'fixture-sources': 'backend/src/test/java',
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
const KINDS = [...TRANSCRIPT_KINDS, 'log-field', 'retired', 'shared-case', 'baseline-addition'];
const NEEDS_SECURITY = new Set(['logs', 'log-field']);
const LISTED = 20;
const LISTED_LOG_LINES = 200;
const SHORT_NUMBER = 4;
const FOUNDATION_ADDRESS = 'info@nfnn.cz';
const BASELINE_FILES = [
  /^regression\/v2\/api\//,
  /^regression\/v2\/test-inventory\.json$/,
  /^regression\/v2\/receipts\//,
  /^regression\/v2\/screens\//,
];
const ADDABLE_BASELINE = /^regression\/v2\/(?:receipts|screens)\//;
const BASELINE_INDEXES = new Set([
  'regression/v2/receipts/digests.json',
  'regression/v2/receipts/refusals.json',
  'regression/v2/screens/manifest.json',
]);
const COMMIT_ID = /^[0-9a-f]{40}$/;
const APPROVED_IN = /^PR #\d+, Jakub \d{4}-\d{2}-\d{2}$/;
const FIELD_KINDS = new Set(['body', 'headers', 'added']);
const SUBJECT_KINDS = new Set(['mails', 'added']);
const NEW_RECEIPT_SAMPLE = /^regression\/v2\/receipts\/[^/]+\.json$/;
const ADDITION_PATCHES = 'regression/v2/additions/';
const ADDITION_PATCH = /^regression\/v2\/additions\/[^/*]+\.patch$/;
const IBAN_DIGITS = 10;
const LITERAL_IBAN =
  /(?<![\p{L}\p{N}])\p{Lu}{2}\d{2}(?: ?[\p{Lu}\d]{4}){3,7}(?: ?[\p{Lu}\d]{1,3})?(?![\p{L}\p{N}])/u;
const FIXTURE_NAME = /^\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)+$/u;
const PERSONAL_FIELD = /^(?:fullName|payerName|street|city|counterparty\w*)$/;
const PERSON_NAME_NEIGHBOURS = ['street', 'city', 'email', 'variableSymbol', 'companyIdentifier'];
const PERSONAL_WORD = /\p{Lu}\p{Ll}{3,}/gu;
const COMMON_WORDS = new Set(['Nová', 'Nové', 'Nový', 'Most']);
const ERASED_PLACEHOLDERS = new Set(['Vymazaný', 'Vymazáno']);
const FORBIDDEN_LOG_SLOTS = [
  'vs',
  'token',
  'secret',
  'jwt',
  'signatory-name',
  'setup-code',
  'recovery-code',
];
const ACCOUNT_DIGITS = 6;
const GIT_STATUS = /^[ACDMRTUXB]\d*$/;
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
  /^regression\/v2\/changes\//,
  /^regression\/v2\/additions\//,
];
const UPPER_WORD = /\p{Lu}[\p{Lu}\d_]*/gu;
const SLOT = /<[a-z-]+(?::\d+)?>/g;
const FIXTURE_ALIAS = /<vs:(\p{Lu}[^>]*)>/gu;

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

function parsed(text, path, what) {
  try {
    return JSON.parse(text);
  } catch (unreadable) {
    throw new InvalidInput(`${what} ${path} cannot be read as JSON: ${unreadable.message}`);
  }
}

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (unreadable) {
    throw new InvalidInput(`${what} ${path} cannot be read: ${unreadable.message}`);
  }
  return parsed(text, path, what);
}

function jsonFiles(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

function personalWords(value, words) {
  if (Array.isArray(value)) {
    value.forEach((item) => personalWords(item, words));
  } else if (value !== null && typeof value === 'object') {
    const person = PERSON_NAME_NEIGHBOURS.some((field) => field in value);
    for (const [field, item] of Object.entries(value)) {
      if (PERSONAL_FIELD.test(field) || (field === 'name' && person)) {
        [item]
          .flat()
          .forEach((part) =>
            typeof part === 'string' ? wordsOf(part, words) : personalWords(part, words),
          );
      } else {
        personalWords(item, words);
      }
    }
  }
}

function wordsOf(text, words) {
  for (const [word] of text.replace(/<[^>]*>/g, ' ').matchAll(PERSONAL_WORD)) {
    if (!COMMON_WORDS.has(word) && !ERASED_PLACEHOLDERS.has(word)) {
      words.add(word);
    }
  }
}

function transcripts(directory, what, data) {
  if (!existsSync(directory)) {
    throw new InvalidInput(
      `The ${what} ${directory} does not exist; record it with API_TRANSCRIPTS=record (.claude/rules/testing.md, "Regression against v2")`,
    );
  }
  const features = new Map();
  for (const path of jsonFiles(directory)) {
    const text = readFileSync(path, 'utf8');
    for (const [, alias] of text.matchAll(FIXTURE_ALIAS)) {
      data.aliases.add(alias);
    }
    const file = parsed(text, path, `The ${what} file`);
    personalWords(file.scenarios ?? {}, data.words);
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
      'securityOk is gone: name the approval as security: {approvedIn: "PR #<number>, Jakub <YYYY-MM-DD>", fields: {"<slot>": "what it holds"}}',
    );
  }
  if (!('security' in entry)) {
    if (NEEDS_SECURITY.has(entry.kind)) {
      problem(
        'a log change needs security: {approvedIn: "PR #<number>, Jakub <YYYY-MM-DD>", fields: {"<slot>": "what it holds"}}, set once Jakub approved it (security.md, Logs)',
      );
    }
    return;
  }
  const { security } = entry;
  if (typeof security !== 'object' || security === null || Array.isArray(security)) {
    problem('security must be an object {approvedIn, fields}');
  }
  if (typeof security.approvedIn !== 'string' || !APPROVED_IN.test(security.approvedIn)) {
    problem(
      `security.approvedIn must read "PR #<number>, Jakub <YYYY-MM-DD>": the pull request where Jakub approved the line and the day he did, not ${shown(security.approvedIn)}`,
    );
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

function validated(entry, file, index, baselineCommit) {
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
    'field',
    'subject',
    'file',
    'recordedFrom',
    'patch',
    'record',
  ]) {
    if (field in entry && typeof entry[field] !== 'string') {
      problem(`${field} must be a string`);
    }
  }
  if ('field' in entry) {
    if (!FIELD_KINDS.has(entry.kind)) {
      problem(
        `field names a JSON path or a header, so only a body, headers or added entry takes it, not ${entry.kind}`,
      );
    }
    if (entry.kind === 'body' && !entry.field.startsWith('$')) {
      problem(
        'a body field is a JSON path that starts with the literal "$" ("$.items[*].amountMinor"), * allowed after it',
      );
    }
    if (entry.kind === 'headers' && !/^[A-Za-z0-9]/.test(entry.field)) {
      problem(
        'a headers field is the literal header name ("cache-control"), * allowed after its first letter',
      );
    }
    if (entry.kind === 'added' && !/^[$A-Za-z0-9]/.test(entry.field)) {
      problem(
        'an added field is a JSON path that starts with "$" or the literal name of a response header',
      );
    }
  }
  if (
    'subject' in entry &&
    (!SUBJECT_KINDS.has(entry.kind) || entry.subject.trim() === '' || entry.subject.startsWith('*'))
  ) {
    problem(
      'subject names the subject of the mail a mails or added entry covers, so only those take it, and it starts with a literal letter (* allowed after it)',
    );
  }
  if ('subject' in entry && 'field' in entry) {
    problem('an entry covers a mail (subject) or a field (field), not both');
  }
  for (const field of ['file', 'recordedFrom', 'patch', 'record']) {
    if (field in entry && entry.kind !== 'baseline-addition') {
      problem(`only a baseline-addition takes ${field}`);
    }
  }
  if (entry.kind === 'baseline-addition') {
    if (!ADDABLE_BASELINE.test(entry.file ?? '')) {
      problem(
        'a baseline addition needs file: the path from the repository root, starting with the literal "regression/v2/receipts/" or "regression/v2/screens/", * allowed after it',
      );
    }
    if (entry.recordedFrom !== baselineCommit) {
      problem(
        `recordedFrom must be the commit in regression/v2/BASELINE_COMMIT (${baselineCommit || 'missing'}), because a baseline file is recorded only from it, not ${shown(entry.recordedFrom)}`,
      );
    }
    if (!ADDITION_PATCH.test(entry.patch ?? '')) {
      problem(
        'a baseline addition needs patch: the change it applied to a checkout of the baseline commit, as "regression/v2/additions/<name>.patch" (git diff of that checkout)',
      );
    }
    if (!entry.record?.trim()) {
      problem(
        'a baseline addition needs record: the command that recorded it on that checkout ("env -u FIO_TOKEN scripts/record-baseline-data.sh")',
      );
    }
    for (const field of ['path', 'scenario', 'line', 'suite', 'test', 'replacement', 'caseFile']) {
      if (field in entry) {
        problem(`a baseline addition names its file, not ${field}`);
      }
    }
  } else if (entry.kind === 'shared-case') {
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
    if (PATH_REFUSED.has(entry.kind) || (entry.kind === 'added' && 'subject' in entry)) {
      if ('path' in entry) {
        problem(
          `${entry.kind === 'added' ? 'an added mail belongs' : `${entry.kind} belong`} to the scenario, not to a request: drop path`,
        );
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
    baselineFile: entry.file,
    file,
    index,
    used: 0,
    usedMain: 0,
    matches: {
      field: glob(entry.field ?? '*'),
      subject: glob(entry.subject ?? '*'),
      file: glob(entry.file ?? '*'),
      path: glob(entry.path ?? '*'),
      scenario: glob(entry.scenario ?? '*'),
      line: entry.kind === 'log-field' ? exactly(entry.line) : glob(entry.line ?? '*'),
      suite: glob(entry.suite ?? '*'),
      test: glob(entry.test ?? '*'),
      caseFile: glob(entry.caseFile ?? '*'),
    },
  };
}

function declarations(directory, baselineCommit) {
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
    return list.map((entry, index) => validated(entry, name, index, baselineCommit));
  });
  return { files, entries };
}

const template = (key) => key.replace(/ #\d+$/, '');

function declare(difference, entries, counter = 'used') {
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
      return entry.matches.subject.test(difference.subject ?? '');
    }
    if (difference.kind === 'added') {
      if (difference.mail) {
        return 'subject' in entry && entry.matches.subject.test(difference.subject);
      }
      if (!('field' in entry)) {
        return false;
      }
    }
    if ('field' in entry && !entry.matches.field.test(difference.field ?? '')) {
      return false;
    }
    if (!('path' in entry) || difference.key === undefined) {
      return !('path' in entry) && difference.key === undefined;
    }
    return (
      entry.matches.path.test(template(difference.key)) || entry.matches.path.test(difference.key)
    );
  });
  if (found) {
    found[counter] += 1;
  }
  return found;
}

function bodyDifferences(baseline, recorded, path, out) {
  const kindOf = (value) =>
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (kindOf(baseline) !== kindOf(recorded)) {
    out.push({
      field: path,
      text: `${path}: ${shorten(shown(baseline), 80)} → ${shorten(shown(recorded), 80)}`,
    });
    return;
  }
  if (kindOf(baseline) === 'object') {
    for (const [field, value] of Object.entries(baseline)) {
      if (!(field in recorded)) {
        out.push({
          field: `${path}.${field}`,
          text: `${path}.${field} odebráno (bylo ${shorten(shown(value), 80)})`,
        });
      } else {
        bodyDifferences(value, recorded[field], `${path}.${field}`, out);
      }
    }
    return;
  }
  if (kindOf(baseline) === 'array') {
    if (baseline.length !== recorded.length) {
      out.push({ field: path, text: `${path}: ${baseline.length} položek → ${recorded.length}` });
    }
    for (let index = 0; index < Math.min(baseline.length, recorded.length); index++) {
      bodyDifferences(baseline[index], recorded[index], `${path}[${index}]`, out);
    }
    return;
  }
  if (baseline !== recorded) {
    out.push({
      field: path,
      text: `${path}: ${shorten(shown(baseline), 80)} → ${shorten(shown(recorded), 80)}`,
    });
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
  const push = (kind, detail, field) => {
    differences.push({ ...at, kind, detail, ...(field === undefined ? {} : { field }) });
    changed = true;
  };
  if (canonical(baseline.request) !== canonical(recorded.request)) {
    const parts = [];
    bodyDifferences(baseline.request ?? {}, recorded.request ?? {}, 'request', parts);
    const added = new Set();
    addedFields(baseline.request ?? {}, recorded.request ?? {}, 'request', added);
    push(
      'request',
      [...parts.map(({ text }) => text), ...[...added].map((field) => `${field} přidáno`)].join(
        '; ',
      ),
    );
  }
  const before = baseline.response ?? {};
  const after = recorded.response ?? {};
  if (before.status !== after.status) {
    push('status', `${before.status} → ${after.status}`);
  }
  for (const [name, value] of Object.entries(before.headers ?? {})) {
    if (!(name in (after.headers ?? {}))) {
      push('headers', `${name} odebráno (bylo ${shown(value)})`, name);
    } else if (canonical(value) !== canonical(after.headers[name])) {
      push('headers', `${name}: ${shown(value)} → ${shown(after.headers[name])}`, name);
    }
  }
  for (const name of Object.keys(after.headers ?? {})) {
    if (!(name in (before.headers ?? {}))) {
      counts.addedHeaders.add(`${name} (${template(key)})`);
      counts.addedDetails.push({
        ...at,
        kind: 'added',
        field: name,
        detail: `hlavička ${name} přidána`,
      });
    }
  }
  if ('body' in before && !('body' in after)) {
    push('body', 'tělo odpovědi odebráno', '$');
  } else if ('body' in before) {
    const parts = [];
    bodyDifferences(before.body, after.body, '$', parts);
    parts.forEach(({ field, text }) => push('body', text, field));
  }
  const fields = new Set();
  addedFields(before.body ?? {}, after.body ?? {}, '$', fields);
  if (!('body' in before) && 'body' in after) {
    fields.add('$');
  }
  for (const field of fields) {
    counts.addedFields.add(`${template(key)} ${field}`);
    counts.addedDetails.push({ ...at, kind: 'added', field, detail: `pole ${field} přidáno` });
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
      subject: String(mail.subject ?? ''),
      detail: partner
        ? `změněno „${mail.subject}“: ${mailDifference(mail, partner)}`
        : `odebráno „${mail.subject}“ (${recipientKind(mail)})`,
    });
    counts.mails[partner ? 'changed' : 'removed'] += 1;
    changed = true;
  }
  counts.mails.added += mails.extra.length;
  mails.extra.forEach((mail) => {
    addedMail(counts, scenario, mail);
    counts.addedDetails.push({
      scenario,
      kind: 'added',
      mail: true,
      subject: String(mail.subject ?? ''),
      detail: `e-mail „${mail.subject}“ přidán`,
    });
  });

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
    addedDetails: [],
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

function compareTranscripts(baseline, recording, differences, counts, shape) {
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

function fixtureNames(directory) {
  if (!existsSync(directory)) {
    throw new InvalidInput(
      `The test sources ${directory} do not exist; --fixture-sources names the folder whose cucumber step definitions hold the fixtures' names`,
    );
  }
  const names = new Set();
  const sources = (folder) =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? sources(path) : name.endsWith('.java') ? [path] : [];
    });
  for (const path of sources(directory).filter((file) => posix(file).includes('/cucumber/'))) {
    for (const [, literal] of readFileSync(path, 'utf8').matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
      if (FIXTURE_NAME.test(literal)) {
        names.add(literal);
      }
    }
  }
  return names;
}

function forbiddenLogData(line, shape, data) {
  const found = [];
  if (line.includes('@')) {
    found.push('an e-mail address (@)');
  }
  const text = line.replace(/<[^>]*>/g, ' ');
  const words = new Set(text.split(/[^\p{L}\p{N}_]+/u));
  for (const alias of data.aliases) {
    if (words.has(alias)) {
      found.push(`the fixture name ${alias}`);
    }
  }
  for (const name of data.names) {
    if (text.includes(name)) {
      found.push(`the fixture name ${name}`);
    }
  }
  for (const word of data.words) {
    if (words.has(word) && !data.aliases.has(word)) {
      found.push(
        `the recorded name or address word ${word} (rename the fixture value or add the word to COMMON_WORDS with a reason in testing.md)`,
      );
    }
  }
  const iban = [...shape.matchAll(/(?<![\p{L}\p{N}])\p{Lu}{2}<digits:(\d+)>/gu)].some(
    ([, digits]) => Number(digits) >= IBAN_DIGITS,
  );
  if (iban || LITERAL_IBAN.test(line)) {
    found.push('an IBAN');
  }
  for (const slot of FORBIDDEN_LOG_SLOTS) {
    if (shape.includes(`<${slot}>`)) {
      found.push(`the masked value <${slot}>`);
    }
  }
  for (const [, before, after] of shape.matchAll(/<digits:(\d+)>\/|\/<digits:(\d+)>/g)) {
    if (Number(before ?? after) >= ACCOUNT_DIGITS) {
      found.push(`a number of ${before ?? after} digits next to "/" (an account number)`);
      break;
    }
  }
  return found;
}

function logDataErrors(recording, shape, data) {
  const errors = [];
  const reported = new Set();
  for (const [feature, scenarios] of recording) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      for (const line of scenario.logs ?? []) {
        const found = forbiddenLogData(line, shape(line), data);
        if (found.length === 0 || reported.has(line)) {
          continue;
        }
        reported.add(line);
        errors.push({
          report: `\`log-data\` ${feature}: ${name}: řádek logu ${shown(line)} nesmí obsahovat ${found.join(', ')} (security.md, Logs; žádné schválení to nepovolí)`,
          error: `the log line ${shown(line)} in ${feature}: ${name} must not hold ${found.join(', ')} (security.md, Logs), and no approval allows it`,
        });
      }
    }
  }
  return errors;
}

export function changedPaths(lines) {
  const statuses = new Map();
  const listed = [];
  for (const line of lines.map((text) => text.trim()).filter((text) => text !== '')) {
    const parts = line.split('\t');
    const status = parts.length > 1 && GIT_STATUS.test(parts[0]) ? parts[0][0] : 'M';
    const path = parts.length > 1 && GIT_STATUS.test(parts[0]) ? parts.at(-1) : line;
    statuses.set(resolve(root, path), status);
    listed.push({ path: isAbsolute(path) ? posix(relative(root, path)) : posix(path), status });
  }
  return {
    all: statuses,
    baseline: listed.filter(({ path }) => BASELINE_FILES.some((rule) => rule.test(path))),
    watched: listed.filter(({ path }) => WATCHED_FILES.some((rule) => rule.test(path))),
    sharedCases: listed.filter(({ path }) => path.startsWith(SHARED_CASES)).map(({ path }) => path),
    patches: listed.filter(({ path }) => path.startsWith(ADDITION_PATCHES)),
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
  [
    `${entry.file}: \`${entry.kind}\``,
    entry.path ?? entry.line ?? entry.test ?? entry.caseFile ?? entry.baselineFile,
    entry.field === undefined ? undefined : `pole ${entry.field}`,
    entry.subject === undefined ? undefined : `„${entry.subject}“`,
    entry.scenario ?? entry.suite,
  ]
    .filter((part) => part !== undefined && part !== '')
    .join(' ');

const shortCommit = (commit) => (commit === '' ? 'neuvedený commit' : commit.slice(0, 12));

function countsTable(counts, lines) {
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
}

function declaredTable(rows, lines, limit) {
  lines.push('| Soubor | Proti | Druh | Kde | Rozdíl | Důvod |', '|---|---|---|---|---|---|');
  for (const { difference, entry, against } of rows.slice(0, limit)) {
    const reason =
      entry.kind === 'retired'
        ? `${entry.reason} (náhrada: ${entry.replacement}${entry.replacementNote ? `; ${entry.replacementNote}` : ''})`
        : entry.reason;
    lines.push(
      `| ${entry.file} | ${against} | \`${difference.kind}\` | ${cell(where(difference))} | ${cell(shorten(difference.detail, 200))} | ${cell(reason)}${entry.contract ? ` (${cell(entry.contract)})` : ''} |`,
    );
  }
  if (rows.length > limit) {
    lines.push(`| … | | | | a dalších ${rows.length - limit} | |`);
  }
}

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
    additions,
    main,
    olderDeclarationFiles,
  } = result;
  const relativeToRoot = (path) => posix(relative(root, resolve(root, path))) || '.';
  const lines = ['## Srovnání s v2', ''];
  lines.push(
    `Nahrávka \`${relativeToRoot(chosen.recording)}\` proti \`${relativeToRoot(chosen.baseline)}\`; deklarace z \`${relativeToRoot(chosen.changes)}\`: ${files.length} souborů, ${entries.length} položek.`,
    '',
  );
  lines.push(
    main.ran
      ? `Proti nahrávce \`main\` z commitu \`${shortCommit(main.commit)}\` (\`${relativeToRoot(chosen.main)}\`) vysvětlují rozdíl jen deklarace v souborech přidaných nebo změněných od toho commitu (${main.entries} položek).`
      : `**Srovnání s main neprovedeno:** ${main.reason}. Platí jen srovnání s v2.`,
    '',
  );
  lines.push(
    errors.length === 0
      ? '**Žádný nedeklarovaný rozdíl.**'
      : `**${errors.length} chyb: srovnání neprošlo.**`,
    '',
  );
  countsTable(counts, lines);
  lines.push(
    inventoryChecked
      ? `| Testy (inventář) | ${counts.tests.unchanged} | ${counts.tests.changed} | ${counts.tests.added} | ${counts.tests.removed} |`
      : '| Testy (inventář) | neprovedeno | | | |',
  );
  lines.push('');
  lines.push('### Srovnání s main', '');
  if (main.ran) {
    lines.push(
      main.errors === 0
        ? `Proti main žádný nedeklarovaný rozdíl (nahrávka z \`${shortCommit(main.commit)}\`).`
        : `**${main.errors} rozdílů proti main (nahrávka z \`${shortCommit(main.commit)}\`) nevysvětluje žádná deklarace přidaná nebo změněná od toho commitu.**`,
      '',
    );
    countsTable(main.counts, lines);
    lines.push(
      main.inventoryChecked
        ? `| Testy (inventář) | ${main.counts.tests.unchanged} | ${main.counts.tests.changed} | ${main.counts.tests.added} | ${main.counts.tests.removed} |`
        : '| Testy (inventář) | neprovedeno | | | |',
    );
    lines.push('');
  } else {
    lines.push(`Srovnání s main neprovedeno: ${main.reason}. Platí jen srovnání s v2.`, '');
  }
  lines.push('### Nedeklarované rozdíly a chyby', '');
  lines.push(
    ...list(
      errors.map((error) => error.report),
      'žádné',
      errors.length,
    ),
    '',
  );
  const own = entries.filter((entry) => entry.changedInPr);
  lines.push('### Deklarace tohoto PR', '');
  lines.push(
    ...list(
      own.map(
        (entry) =>
          `${describeEntry(entry)}: ${entry.reason}${entry.prStatus === 'A' ? '' : ' (starší soubor, který tento PR mění)'}; proti v2 ${entry.used}×, proti main ${main.ran ? `${entry.usedMain}×` : 'neprovedeno'}`,
      ),
      changed ? 'žádné' : 'neznámé: srovnání nedostalo seznam změněných souborů (--changed)',
      own.length,
    ),
    '',
  );
  const ownRows = declared.filter(({ entry }) => entry.changedInPr);
  if (ownRows.length > 0) {
    lines.push('Rozdíly, které deklarace tohoto PR vysvětlují:', '');
    declaredTable(ownRows, lines, ownRows.length);
    lines.push('');
  }
  if (olderDeclarationFiles) {
    lines.push('### Starší soubory deklarací, které tento PR mění', '');
    lines.push(
      ...list(
        olderDeclarationFiles.map(({ path, status }) => `\`${status}\` \`${path}\``),
        'žádné',
        olderDeclarationFiles.length,
      ),
      '',
    );
    lines.push('### Doplněno do základu v2', '');
    lines.push(
      ...list(
        additions.map(
          ({ path, status, entry }) =>
            `\`${status}\` \`${path}\`: ${entry.reason} (${entry.file}; nahráno z \`${shortCommit(entry.recordedFrom)}\`)`,
        ),
        'nic',
        additions.length,
      ),
      '',
    );
    const recipes = [...new Set(additions.map(({ entry }) => entry))];
    if (recipes.length > 0) {
      lines.push('Takto se doplněk znovu nahraje (z kořene repozitáře):', '', '```sh');
      for (const entry of recipes) {
        lines.push(
          `git worktree add --detach ../v2-baseline ${entry.recordedFrom}`,
          `git -C ../v2-baseline apply "$PWD/${entry.patch}"`,
          `(cd ../v2-baseline && ${entry.record})`,
          `git worktree remove --force ../v2-baseline`,
        );
      }
      lines.push('```', '');
    }
    lines.push('### Změny nahrávání a srovnání', '');
    lines.push(
      ...list(
        changed.watched.map(({ path, status }) => `\`${status}\` \`${path}\``),
        'žádné: nahrávání, maskování ani srovnání se nemění',
        changed.watched.length,
      ),
      '',
    );
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
          }; použito ${entry.used + entry.usedMain}×`,
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
  lines.push('### Deklarované rozdíly starších PR', '');
  const olderRows = declared.filter(({ entry }) => !entry.changedInPr);
  if (olderRows.length === 0) {
    lines.push('- žádné', '');
  } else {
    declaredTable(olderRows, lines, 200);
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
  const unused = entries.filter((entry) => entry.used === 0 && entry.usedMain === 0);
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

function judge(differences, entries, counter, againstMain) {
  const errors = [];
  const declared = [];
  const reportPrefix = againstMain ? 'proti main: ' : '';
  const errorPrefix = againstMain ? 'against main: ' : '';
  for (const difference of differences) {
    const entry = declare(difference, entries, counter);
    if (!entry) {
      errors.push({
        report: `${reportPrefix}\`${difference.kind}\` ${where(difference)}: ${difference.detail}`,
        error: `${errorPrefix}undeclared ${difference.kind} difference at ${where(difference)}: ${difference.detail}`,
      });
      continue;
    }
    const missing = (difference.slots ?? []).filter(
      (slot) => !(entry.security && slot in entry.security.fields),
    );
    if (missing.length > 0) {
      errors.push({
        report: `${reportPrefix}\`${difference.kind}\` ${where(difference)}: ${difference.detail}; schválení v ${entry.file} neříká, co drží ${missing.join(', ')}`,
        error: `${errorPrefix}the approval in ${entry.file} does not say what ${missing.join(', ')} holds in ${difference.line ?? difference.detail}`,
      });
      continue;
    }
    declared.push({ difference, entry, against: againstMain ? 'main' : 'v2' });
  }
  return { errors, declared };
}

function countAdded(entries, counts, counter) {
  for (const entry of entries.filter(
    (candidate) =>
      candidate.kind === 'added' && !('field' in candidate) && !('subject' in candidate),
  )) {
    entry[counter] = counts.addedPairs.filter(
      (pair) => entry.matches.scenario.test(pair.scenario) && entry.matches.path.test(pair.path),
    ).length;
  }
}

function baselineCommitIn(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

function strictForThisPullRequest(entries) {
  for (const entry of entries.filter((candidate) => candidate.changedInPr)) {
    if (entry.kind === 'mails' && !('subject' in entry)) {
      throw new InvalidInput(
        `${entry.file} entry ${entry.index + 1}: a mails entry in a file this pull request adds or changes needs subject: the subject of the v2 mail it covers ("Potvrďte svůj e-mail", * allowed after its first letter), so it covers no other mail of its scenario`,
      );
    }
  }
}

function replacementProblems(entries, freshTests, errors) {
  for (const entry of entries.filter((candidate) => candidate.kind === 'retired')) {
    const isTestId = TEST_ANCHOR.test(entry.replacement) && !entry.replacement.includes('*');
    const listed = freshTests === undefined || freshTests.has(entry.replacement);
    if (isTestId && listed) {
      continue;
    }
    if (!entry.changedInPr) {
      entry.replacementNote = isTestId ? 'náhrada není v inventáři testů' : 'náhrada není test';
      continue;
    }
    errors.push(
      isTestId
        ? {
            report: `\`retired\` ${describeEntry(entry)}: náhrada „${entry.replacement}“ v inventáři testů není`,
            error: `the replacement ${entry.replacement} of ${describeEntry(entry)} is not in the test inventory: name a test that runs now`,
          }
        : {
            report: `\`retired\` ${describeEntry(entry)}: náhrada „${shorten(entry.replacement, 100)}“ není test; uveďte test, který kontrolu přebírá, jako ho píše inventář („<třída nebo soubor> > <název>“)`,
            error: `the retirement ${describeEntry(entry)} names a replacement that is no test id (${shorten(entry.replacement, 100)}): name the test that takes over as "<class or file> > <name>", as the test inventory lists it`,
          },
    );
  }
}

export function run(argv) {
  const chosen = options(argv);
  const at = (path) => resolve(root, path);
  const changesDirectory = at(chosen.changes);
  const { files, entries } = declarations(
    changesDirectory,
    baselineCommitIn(at(chosen['baseline-commit'])),
  );
  const readChanged = (option) =>
    option === '' ? undefined : changedPaths(readFileSync(at(option), 'utf8').split('\n'));
  const changed = readChanged(chosen.changed);
  const sinceMain = chosen['main-changed'] === '' ? changed : readChanged(chosen['main-changed']);
  for (const entry of entries) {
    const path = join(changesDirectory, entry.file);
    entry.prStatus = changed?.all.get(path);
    entry.changedInPr = entry.prStatus !== undefined;
    entry.sinceMain = sinceMain?.all.has(path) ?? false;
  }
  strictForThisPullRequest(entries);
  const data = {
    aliases: new Set(),
    words: new Set(),
    names: fixtureNames(at(chosen['fixture-sources'])),
  };
  const baseline = transcripts(at(chosen.baseline), 'baseline', data);
  const recording = transcripts(at(chosen.recording), 'recording', data);
  const mainRecording =
    chosen.main === '' ? undefined : transcripts(at(chosen.main), 'recording of main', data);
  const shape = logShaper(enumWords(baseline));
  const differences = [];
  const counts = emptyCounts();
  compareTranscripts(baseline, recording, differences, counts, shape);
  const inventoryChecked = chosen.inventory !== '';
  let freshTests;
  let fresh;
  if (inventoryChecked) {
    fresh = readJson(at(chosen.inventory), 'The test inventory');
    compareInventory(
      readJson(at(chosen['inventory-baseline']), 'The baseline test inventory'),
      fresh,
      differences,
      counts,
    );
    freshTests = new Set(Object.values(fresh.suites ?? {}).flat());
  }
  const errors = [];
  const additions = [];
  for (const { path, status } of changed?.baseline ?? []) {
    const addable = ADDABLE_BASELINE.test(path);
    if (addable && status === 'A' && !NEW_RECEIPT_SAMPLE.test(path)) {
      errors.push({
        report: `\`baseline\` ${path}: do základu v2 přibývají jen nové vzorky dokladů \`regression/v2/receipts/<vzorek>.json\` a nové položky indexů; nové stavy obrazovek jsou nové položky \`screens/manifest.json\``,
        error: `the pull request adds ${path}, but the v2 baseline takes new files only as regression/v2/receipts/<sample>.json, and new screen states only as new entries of regression/v2/screens/manifest.json`,
      });
      continue;
    }
    if (addable && (status === 'A' || (status === 'M' && BASELINE_INDEXES.has(path)))) {
      const entry = entries.find(
        (candidate) =>
          candidate.kind === 'baseline-addition' &&
          candidate.changedInPr &&
          candidate.matches.file.test(path),
      );
      if (entry) {
        entry.used += 1;
        additions.push({ path, status, entry });
        continue;
      }
      errors.push({
        report: `\`baseline\` ${path}: ${status === 'A' ? 'nový soubor' : 'nové položky'} základu v2 smí přidat jen PR, který je nahrál z commitu v \`regression/v2/BASELINE_COMMIT\`; uveďte \`baseline-addition\` s \`recordedFrom\` v souboru \`regression/v2/changes/\`, který tento PR přidává nebo mění`,
        error: `the pull request adds ${status === 'A' ? 'the file' : 'entries to'} ${path} of the v2 baseline without a baseline-addition recordedFrom the commit in regression/v2/BASELINE_COMMIT, in a regression/v2/changes/ file it adds or changes`,
      });
      continue;
    }
    errors.push(
      addable
        ? {
            report: `\`baseline\` ${path}: tento PR ${status === 'D' ? 'maže' : 'mění'} soubor základu v2; existující soubor vzorků dokladů a snímků se nikdy nemění ani nemaže, nové se nahrávají z commitu v \`regression/v2/BASELINE_COMMIT\``,
            error: `the pull request ${status === 'D' ? 'deletes' : 'changes'} the v2 baseline file ${path}; an existing receipt or screens file never changes and is never deleted, and a new one is recorded from the commit in regression/v2/BASELINE_COMMIT`,
          }
        : {
            report: `\`baseline\` ${path}: tento PR mění základ v2, který se nikdy nepřegeneruje; deklarujte rozdíl v \`regression/v2/changes/\``,
            error: `the pull request changes the v2 baseline file ${path}; declare the difference in regression/v2/changes/ instead`,
          },
    );
  }
  for (const { path, status } of changed?.patches ?? []) {
    const named = entries.some(
      (candidate) =>
        candidate.kind === 'baseline-addition' && candidate.changedInPr && candidate.patch === path,
    );
    if (status === 'A' && named) {
      continue;
    }
    errors.push({
      report: `\`baseline\` ${path}: ${status === 'A' ? 'žádné `baseline-addition` tohoto PR tuto záplatu nejmenuje' : `tento PR ${status === 'D' ? 'maže' : 'mění'} záplatu, kterou už nahrál starší PR; záplata se nikdy nemění`}`,
      error:
        status === 'A'
          ? `the pull request adds ${path}, but no baseline-addition in a regression/v2/changes/ file it adds or changes names it as its patch`
          : `the pull request ${status === 'D' ? 'deletes' : 'changes'} ${path}; a patch of regression/v2/additions/ records how an addition was made and never changes`,
    });
  }
  errors.push(...logDataErrors(recording, shape, data));
  const sharedCases = [];
  for (const path of changed?.sharedCases ?? []) {
    const entry = entries.find(
      (candidate) =>
        candidate.kind === 'shared-case' &&
        candidate.changedInPr &&
        candidate.matches.caseFile.test(path),
    );
    if (!entry) {
      errors.push({
        report: `\`shared-case\` ${path}: tento PR mění sdílené případy bez deklarace; pojmenujte soubor v souboru \`regression/v2/changes/\`, který tento PR mění`,
        error: `the pull request changes ${path} without a shared-case declaration naming it in a regression/v2/changes/ file that this pull request changes`,
      });
      continue;
    }
    entry.used += 1;
    sharedCases.push({ path, entry });
  }
  const againstV2 = judge(differences, entries, 'used', false);
  errors.push(...againstV2.errors);
  const declared = [...againstV2.declared];
  countAdded(entries, counts, 'used');
  replacementProblems(entries, freshTests, errors);
  const warnings = [];
  let main;
  if (mainRecording) {
    const mainDifferences = [];
    const mainCounts = emptyCounts();
    compareTranscripts(mainRecording, recording, mainDifferences, mainCounts, shape);
    mainDifferences.push(...mainCounts.addedDetails);
    const mainInventoryChecked = inventoryChecked && chosen['main-inventory'] !== '';
    if (mainInventoryChecked) {
      compareInventory(
        readJson(at(chosen['main-inventory']), 'The test inventory of main'),
        fresh,
        mainDifferences,
        mainCounts,
      );
    }
    const mainEntries = entries.filter(
      (entry) =>
        entry.sinceMain &&
        (entry.kind !== 'retired' ||
          (TEST_ANCHOR.test(entry.replacement) && (freshTests?.has(entry.replacement) ?? true))),
    );
    const againstMain = judge(mainDifferences, mainEntries, 'usedMain', true);
    countAdded(mainEntries, mainCounts, 'usedMain');
    errors.push(...againstMain.errors);
    declared.push(...againstMain.declared);
    main = {
      ran: true,
      commit: chosen['main-commit'],
      counts: mainCounts,
      errors: againstMain.errors.length,
      entries: mainEntries.length,
      inventoryChecked: mainInventoryChecked,
    };
  } else {
    main = {
      ran: false,
      reason: chosen['main-missing'] || 'nahrávka main nebyla zadána (--main)',
    };
    warnings.push(
      `the comparison with the recording of main did not run (${main.reason}); only the comparison with v2 counts`,
    );
  }
  for (const entry of entries.filter(
    (candidate) => candidate.used === 0 && candidate.usedMain === 0 && candidate.changedInPr,
  )) {
    errors.push({
      report: `nepoužitá deklarace ${describeEntry(entry)}: soubor mění tento PR, takže musí pokrýt skutečný rozdíl`,
      error: `the declaration ${describeEntry(entry)} is unused, and its file ${entry.file} is part of this pull request`,
    });
  }
  const olderDeclarationFiles =
    changed === undefined
      ? undefined
      : [...changed.all]
          .filter(
            ([path, status]) =>
              status !== 'A' &&
              path.startsWith(`${changesDirectory}${sep}`) &&
              path.endsWith('.json'),
          )
          .map(([path, status]) => ({ path: posix(relative(root, path)), status }));
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
    additions,
    main,
    olderDeclarationFiles,
  });
  return { report, errors, warnings, output: chosen.report === '' ? '' : at(chosen.report) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { report, errors, warnings, output } = run(process.argv.slice(2));
    if (output !== '') {
      writeFileSync(output, `${report}\n`);
    }
    console.log(report);
    for (const warning of warnings) {
      console.error(`::warning::${warning}`);
    }
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
