#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaults = {
  baseline: 'regression/v2/api',
  recording: 'backend/build/api-transcripts',
  changes: 'regression/v2/changes',
  'inventory-baseline': 'regression/v2/test-inventory.json',
  inventory: '',
  report: '',
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
const KINDS = [...TRANSCRIPT_KINDS, 'log-field', 'retired'];
const LISTED = 20;

class InvalidInput extends Error {}

const posix = (path) => path.split(sep).join('/');
const shown = (value) =>
  typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? 'nic');
const shorten = (text, length = 160) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

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
    problem('needs a reason naming the decision and the contract section');
  }
  for (const field of ['path', 'scenario', 'line', 'suite', 'test', 'replacement', 'contract']) {
    if (field in entry && typeof entry[field] !== 'string') {
      problem(`${field} must be a string`);
    }
  }
  if (entry.kind === 'retired') {
    for (const field of ['suite', 'test', 'replacement']) {
      if (!entry[field]?.trim()) {
        problem(
          `a retired test needs ${field}${field === 'replacement' ? ': the test that takes over, or why none does' : ''}`,
        );
      }
    }
  } else if (entry.kind === 'log-field') {
    if (!entry.line?.trim()) {
      problem('a new log field needs line: the shape of the log line, * allowed');
    }
  } else {
    for (const field of ['path', 'scenario']) {
      if (!entry[field]?.trim()) {
        problem(`needs ${field} (* allowed)`);
      }
    }
  }
  return {
    ...entry,
    file,
    used: 0,
    matches: {
      path: glob(entry.path ?? '*'),
      scenario: glob(entry.scenario ?? '*'),
      line: glob(entry.line ?? '*'),
      suite: glob(entry.suite ?? '*'),
      test: glob(entry.test ?? '*'),
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
    const path = difference.key ?? '';
    return (
      entry.matches.scenario.test(difference.scenario) &&
      (entry.matches.path.test(template(path)) || entry.matches.path.test(path))
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

export function logShape(line) {
  return line
    .replace(/^[A-Z]+ /, '')
    .replace(/<([a-z-]+):[^>]*>/g, '<$1>')
    .replace(/\d+/g, '<n>')
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g, (word) => (word.length > 1 ? '<enum>' : word))
    .replace(/<enum>(?:, <enum>)+/g, '<enum>, …');
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

function compareScenario(scenario, baseline, recorded, differences, counts) {
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
      counts.addedTemplates.add(template(key));
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
        : `odebráno „${mail.subject}“ (${(mail.to ?? []).join(', ')})`,
    });
    counts.mails[partner ? 'changed' : 'removed'] += 1;
    changed = true;
  }
  counts.mails.added += mails.extra.length;

  const logs = unmatched(baseline.logs ?? [], recorded.logs ?? []);
  counts.logs.unchanged += (baseline.logs ?? []).length - logs.missing.length;
  for (const line of logs.missing) {
    const index = logs.extra.findIndex((candidate) => logShape(candidate) === logShape(line));
    const partner = index >= 0 ? logs.extra.splice(index, 1)[0] : undefined;
    differences.push({
      scenario,
      kind: 'logs',
      detail: partner ? `změněno ${shown(line)} → ${shown(partner)}` : `odebráno ${shown(line)}`,
    });
    counts.logs[partner ? 'changed' : 'removed'] += 1;
    changed = true;
  }
  counts.logs.added += logs.extra.length;
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
    addedTemplates: new Set(),
    addedScenarios: [],
    addedFields: new Set(),
    addedHeaders: new Set(),
    addedTests: [],
    newLogFields: 0,
  };
}

function compareTranscripts(baseline, recording, differences, counts) {
  const knownShapes = new Set();
  for (const scenarios of baseline.values()) {
    for (const scenario of Object.values(scenarios)) {
      (scenario.logs ?? []).forEach((line) => knownShapes.add(logShape(line)));
    }
  }
  for (const [feature, scenarios] of baseline) {
    const recordedScenarios = recording.get(feature) ?? {};
    for (const [name, scenario] of Object.entries(scenarios)) {
      const label = `${feature}: ${name}`;
      if (!(name in recordedScenarios)) {
        differences.push({ scenario: label, kind: 'removed', detail: 'scénář odebrán' });
        counts.scenarios.removed += 1;
      } else if (compareScenario(label, scenario, recordedScenarios[name], differences, counts)) {
        counts.scenarios.changed += 1;
      } else {
        counts.scenarios.unchanged += 1;
      }
    }
  }
  for (const [feature, scenarios] of recording) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      if (!(name in (baseline.get(feature) ?? {}))) {
        counts.scenarios.added += 1;
        counts.addedScenarios.push(`${feature}: ${name}`);
        counts.requests.added += Object.keys(scenario.requests ?? {}).length;
        Object.keys(scenario.requests ?? {}).forEach((key) =>
          counts.addedTemplates.add(template(key)),
        );
        counts.mails.added += (scenario.mails ?? []).length;
        counts.logs.added += (scenario.logs ?? []).length;
      }
    }
  }
  const reported = new Set();
  for (const [feature, scenarios] of recording) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      for (const line of scenario.logs ?? []) {
        const shape = logShape(line);
        if (!knownShapes.has(shape) && !reported.has(shape)) {
          reported.add(shape);
          differences.push({
            scenario: `${feature}: ${name}`,
            kind: 'log-field',
            line: shape,
            detail: `nový tvar řádku logu ${shown(shape)}`,
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

function where(difference) {
  if (difference.kind === 'retired') {
    return `${difference.suite} › ${difference.test}`;
  }
  return difference.key ? `${difference.scenario} · \`${difference.key}\`` : difference.scenario;
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function list(items, empty) {
  if (items.length === 0) {
    return [`- ${empty}`];
  }
  const lines = items.slice(0, LISTED).map((item) => `- ${cell(item)}`);
  if (items.length > LISTED) {
    lines.push(`- … a dalších ${items.length - LISTED}`);
  }
  return lines;
}

function render({
  chosen,
  counts,
  undeclared,
  declared,
  invalidLogFields,
  entries,
  files,
  inventoryChecked,
}) {
  const relativeToRoot = (path) => posix(relative(root, resolve(root, path))) || '.';
  const lines = ['## Srovnání s v2', ''];
  lines.push(
    `Nahrávka \`${relativeToRoot(chosen.recording)}\` proti \`${relativeToRoot(chosen.baseline)}\`; deklarace z \`${relativeToRoot(chosen.changes)}\`: ${files.length} souborů, ${entries.length} položek.`,
    '',
  );
  const blocking = undeclared.length + invalidLogFields.length;
  lines.push(
    blocking === 0
      ? '**Žádný nedeklarovaný rozdíl.**'
      : `**${blocking} nedeklarovaných rozdílů: srovnání neprošlo.**`,
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
  lines.push('### Nedeklarované rozdíly', '');
  lines.push(
    ...list(
      [
        ...undeclared.map(
          (difference) => `\`${difference.kind}\` ${where(difference)}: ${difference.detail}`,
        ),
        ...invalidLogFields.map(
          ({ difference, entry }) =>
            `\`log-field\` ${where(difference)}: ${difference.detail}; deklarace v ${entry.file} nemá \`securityOk: true\``,
        ),
      ],
      'žádné',
    ),
    '',
  );
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
  if (inventoryChecked) {
    lines.push(`Testy (${counts.addedTests.length}):`, ...list(counts.addedTests, 'žádné'), '');
  }
  const unused = entries.filter((entry) => entry.used === 0);
  lines.push('### Nepoužité deklarace', '');
  lines.push(
    ...list(
      unused.map((entry) =>
        `${entry.file}: \`${entry.kind}\` ${entry.path ?? entry.line ?? entry.test ?? ''} ${entry.scenario ?? entry.suite ?? ''}`.trim(),
      ),
      'žádné',
    ),
  );
  lines.push('');
  return lines.join('\n');
}

export function run(argv) {
  const chosen = options(argv);
  const at = (path) => resolve(root, path);
  const { files, entries } = declarations(at(chosen.changes));
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
  const undeclared = [];
  const declared = [];
  const invalidLogFields = [];
  for (const difference of differences) {
    const entry = declare(difference, entries);
    if (!entry) {
      undeclared.push(difference);
    } else if (difference.kind === 'log-field' && entry.securityOk !== true) {
      invalidLogFields.push({ difference, entry });
    } else {
      declared.push({ difference, entry });
    }
  }
  for (const entry of entries.filter((candidate) => candidate.kind === 'added')) {
    entry.used = [...counts.addedTemplates].filter((path) => entry.matches.path.test(path)).length;
  }
  const report = render({
    chosen,
    counts,
    undeclared,
    declared,
    invalidLogFields,
    entries,
    files,
    inventoryChecked,
  });
  return {
    report,
    undeclared,
    invalidLogFields,
    output: chosen.report === '' ? '' : at(chosen.report),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { report, undeclared, invalidLogFields, output } = run(process.argv.slice(2));
    if (output !== '') {
      writeFileSync(output, `${report}\n`);
    }
    console.log(report);
    for (const difference of undeclared) {
      console.error(
        `::error::undeclared ${difference.kind} difference at ${where(difference)}: ${difference.detail}`,
      );
    }
    for (const { difference, entry } of invalidLogFields) {
      console.error(
        `::error::the new log field ${difference.line} is declared in ${entry.file} without securityOk: true`,
      );
    }
    process.exit(undeclared.length + invalidLogFields.length === 0 ? 0 : 1);
  } catch (failure) {
    if (failure instanceof InvalidInput) {
      console.error(`::error::${failure.message}`);
      process.exit(2);
    }
    throw failure;
  }
}
