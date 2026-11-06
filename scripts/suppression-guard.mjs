#!/usr/bin/env node
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const GUARD = 'scripts/suppression-guard.mjs';
const GUARD_TESTS = 'scripts/suppression-guard.test.mjs';
const GUARD_WORKFLOW = '.github/workflows/suppressions.yml';
const ALWAYS_JUDGED = new Set([GUARD, GUARD_WORKFLOW]);
const RELAXING_FILES = new Set(['archunit.properties', 'archunit_ignore_patterns.txt', '.prettierignore', '.gitattributes']);
const DECIDED_FILES = new Set(['frontend/e2e/devices/known-findings.ts']);

const JAVA = /\.(?:java|kt|kts)$/;
const SCRIPT = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const DIRECTIVES = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts|html|scss|css|ya?ml)$/;
const FEATURE = /\.feature$/;
const TEST_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$|Tests?\.(?:java|kt)$|\.feature$/;
const CI_DEFINITION = /^\.github\/(?:workflows|actions)\//;
const CHECK_SCRIPTS = new Set([
  'scripts/compare-v2.mjs',
  'scripts/compare-v2-baseline.mjs',
  'scripts/compare-screens.mjs',
  'scripts/compare-recordings.mjs',
  'scripts/test-inventory.mjs',
  'scripts/png-pixels.mjs',
  'scripts/stack-journey.mjs',
  'scripts/backend-log.sh',
  'scripts/fake-fio.mjs',
  'frontend/scripts/check-e2e-shards.mjs',
  'frontend/scripts/check-receipt-chunks.mjs',
  'frontend/scripts/check-themes.mjs',
  'frontend/scripts/needs-connection.mjs',
  'frontend/scripts/pinned-libraries.mjs',
  'frontend/scripts/stylelint-hover-media.mjs',
  'frontend/scripts/probe-edge-caching.mjs',
  'frontend/scripts/probe-asset-caching.mjs',
  'frontend/scripts/security-headers.mjs',
  'frontend/scripts/immutable-locations.mjs',
  'frontend/scripts/app-routes.mjs',
  'frontend/scripts/serve-dist.mjs',
  'frontend/scripts/dev-port.mjs',
  'frontend/eslint-confinement.js',
]);
const BUILD_DEFINITION =
  /(?:^|\/)settings\.gradle(?:\.kts)?$|(?:^|\/)buildSrc\/|(?:^|\/)gradle\/(?:.*\/)?[^/]+\.gradle(?:\.kts)?$|(?:^|\/)gradle\/wrapper\/gradle-wrapper\.properties$|^\.github\/docker-bake\.hcl$/;
const WHOLE_FILE_RULES = [
  { matches: (path) => CI_DEFINITION.test(path), label: 'a CI definition' },
  { matches: (path) => CHECK_SCRIPTS.has(path), label: 'a script that decides a required check' },
  { matches: (path) => BUILD_DEFINITION.test(path), label: 'the build definition' },
  { matches: (path) => /(?:^|\/)\.(?:npmrc|yarnrc(?:\.yml)?)$/.test(path), label: "the package manager's configuration" },
  { matches: (path) => path === 't3.json', label: 'the commands T3 Code runs on worktree setup and settle' },
];
const GRADLE = /(?:^|\/)build\.gradle(?:\.kts)?$/;
const PLAYWRIGHT = /(?:^|\/)playwright\.config\.[cm]?[jt]s$/;
const VITEST = /(?:^|\/)vitest\.(?:config|workspace)\.[cm]?[jt]s$/;
const ESLINT = /(?:^|\/)(?:eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.\w+)?)$/;
const STYLELINT = /(?:^|\/)(?:\.stylelintrc(?:\.\w+)?|stylelint\.config\.[cm]?[jt]s)$/;
const ANGULAR = /(?:^|\/)angular\.json$/;
const PACKAGE_JSON = /(?:^|\/)package\.json$/;
const TSCONFIG = /(?:^|\/)tsconfig[^/]*\.json$/;
const QUALIFIED = String.raw`@(?:[\w.]+\.)?`;
const TEST_LIKE = String.raw`(?<![\w$.])[\w$]*[Tt]est`;
const TEST_OR_SUITE = String.raw`(?<![\w$.])(?:[\w$]*[Tt]est|it|describe|suite)`;
const ESLINT_LOOSE = String.raw`(?:'(?:off|warn)'|"(?:off|warn)"|[01])`;
const MASKED_EXIT = /\|\|\s*(?:true\b|(?:\/usr)?\/bin\/true(?=\s|$|[;)"])|exit\s+0\b|:(?=\s|$|[;)"])|echo\b|printf\b)/;

const PATTERNS = [
  { files: JAVA, pattern: new RegExp(`${QUALIFIED}SuppressWarnings\\b`) },
  { files: JAVA, pattern: new RegExp(`${QUALIFIED}(?:Disabled|EnabledIf|EnabledOn)\\w*`) },
  { files: JAVA, pattern: new RegExp(`${QUALIFIED}ArchIgnore\\b`) },
  { files: JAVA, pattern: /@(?:file:)?(?:[\w.]+\.)?Suppress\s*\(/ },
  { files: JAVA, pattern: /\ballowEmptyShould\s*\(/ },
  { files: JAVA, pattern: /\b(?:FreezingArchRule|ArchConfiguration)\b/ },
  { files: JAVA, pattern: /\.ignoreDependency\s*\(/ },
  { files: JAVA, pattern: /\bwithOptionalLayers\s*\(\s*true\b/ },
  { files: JAVA, pattern: /\bimportOptions\s*=(?!\s*ImportOption\.DoNotIncludeTests\.class\s*,?\s*$)/ },
  { files: JAVA, pattern: /\b(?:assumeTrue|assumeFalse|assumeThat|assumingThat)\s*\(/ },
  { files: JAVA, pattern: /\bAssumptions\s*\.\s*abort\s*\(|(?<![\w$.])abort\s*\(/ },
  { files: JAVA, pattern: /^\s*(?:\/\/|\/\*|\*).*@Test\b/, kind: 'a commented-out test' },
  { files: /\.java$/, pattern: new RegExp(`${QUALIFIED}ExcludeTags\\b|\\bFILTER_TAGS\\w*|cucumber\\.filter\\.tags`) },
  { files: /AcceptanceTests\.java$/, pattern: /\b(?:IncludeTags|SelectClasspathResource|ExcludeClassNamePatterns|IncludeClassNamePatterns|ConfigurationParameter)\b/ },
  { files: DIRECTIVES, pattern: /eslint-disable/ },
  { files: DIRECTIVES, pattern: /@ts-(?:ignore|expect-error|nocheck)\b/ },
  { files: DIRECTIVES, pattern: /stylelint-disable/ },
  { files: DIRECTIVES, pattern: /prettier-ignore/ },
  { files: SCRIPT, pattern: /^\s*(?:\/\/|\/\*|\*).*?(?<![\w$.])(?:it|test|describe)\s*\(/, kind: 'a commented-out test' },
  { files: SCRIPT, pattern: /(?<![\w$.])(?:it|describe|suite)(?:\.\w+)*\.skip(?:\.\w+)*\s*\(/ },
  { files: SCRIPT, pattern: new RegExp(`${TEST_LIKE}(?:\\.\\w+)*\\.skip\\.\\w+(?:\\.\\w+)*\\s*\\(`) },
  { files: SCRIPT, pattern: new RegExp(`${TEST_OR_SUITE}(?:\\.\\w+)*\\.(?:only|fixme)(?:\\.\\w+)*\\s*\\(`) },
  { files: SCRIPT, pattern: new RegExp(`${TEST_OR_SUITE}(?:\\.\\w+)*\\.(?:skip|only|fixme)(?![\\w$]|\\s*[(.\\[])`) },
  { files: SCRIPT, pattern: new RegExp(`${TEST_OR_SUITE}(?:\\.\\w+)*\\s*\\[\\s*['"\`](?:skip|only|fixme|fail)['"\`]\\s*\\]`) },
  { files: SCRIPT, pattern: /(?<![\w$.])(?:xit|xdescribe|xtest)\s*\(/ },
  { files: SCRIPT, pattern: /(?<![\w$.])(?:it|test)(?:\.\w+)*\.todo\s*\(/ },
  { files: FEATURE, pattern: /^\s*(?:@\S+\s+)*@(?:ignore|wip)(?!\S)/ },
  { files: FEATURE, pattern: /^\s*#.*\b(?:Scenario|Example|Feature|Background|Rule)\b/, kind: 'a commented-out scenario' },
  { files: PLAYWRIGHT, pattern: /\b(?:failOnFlakyTests|forbidOnly|testIgnore|grepInvert|grep|testMatch|testDir)\b/ },
  { files: VITEST, pattern: /\b(?:exclude|allowOnly|passWithNoTests)\b/ },
  {
    files: GRADLE,
    pattern:
      /\b(?:set)?(?:[Ii]nclude|[Ee]xclude)\w*|\b(?:ignoreFailures|isFailOnNoMatchingTests|failOnNoMatchingTests|onlyIf|isEnabled|StopExecutionException)\b|dryRun|dry-run|\benabled\s*=|actions\.clear\(\)|cucumber\.filter\.tags|CUCUMBER_FILTER_TAGS/,
  },
  { files: /(?:^|\/)gradle\.properties$/, pattern: /\bnoCucumber\b/ },
  {
    files: /\.properties$/,
    pattern:
      /cucumber\.(?:filter\.|features|glue)|cucumber\.execution\.dry-run|junit\.platform\.execution\.dryRun|junit\.jupiter\.(?:conditions\.deactivate|extensions\.autodetection)/,
  },
  {
    files: ESLINT,
    pattern: new RegExp(`:\\s*${ESLINT_LOOSE}\\s*[,}\\]]|\\[\\s*${ESLINT_LOOSE}\\s*,|\\bignores\\s*:`),
  },
  { files: STYLELINT, pattern: /:\s*null\b|\[\s*null\s*,|\bignoreFiles\b|\b(?:severity|defaultSeverity)\b/ },
  { files: TSCONFIG, pattern: /"(?:strict\w*|no[A-Z]\w*)"\s*:\s*false\b|"skipLibCheck"\s*:\s*true\b/ },
  { files: /(?:^|\/)package\.json$/, pattern: /--grep-invert|--exclude\b|--pass-?[Ww]ith-?[Nn]o-?[Tt]ests/ },
  { files: /(?:^|\/)package\.json$/, pattern: MASKED_EXIT },
  { files: /(?:^|\/)package\.json$/, pattern: /\\u/, kind: 'a unicode escape in a package.json' },
  { files: ANGULAR, pattern: /"(?:exclude|include)"/ },
];

const REMOVED_STRICTNESS = [
  { files: PLAYWRIGHT, pattern: /\b(?:forbidOnly|failOnFlakyTests)\b/ },
  { files: ESLINT, pattern: /'error'|"error"/ },
  { files: TSCONFIG, pattern: /"(?:strict\w*|noUnused\w*|noImplicit\w*)"\s*:\s*true\b/ },
  { files: PACKAGE_JSON, pattern: /--max-warnings\b/ },
];

const LIST_FILES = [PLAYWRIGHT, VITEST, ESLINT, STYLELINT, ANGULAR];
const PACKAGE_SCRIPTS = /"scripts"\s*:\s*\{/g;
const RELAXING_LIST = /["']?\b(ignores|exclude|include|testIgnore|testMatch|grep|grepInvert|ignoreFiles)\b["']?\s*:\s*\[/g;
const RULE_LOOSENED = /:\s*\[\s*\n\s*(?:'(?:off|warn)'|"(?:off|warn)"|0|1|null)(?=\s*[,\]])/g;

const CONDITIONAL_CALL = new RegExp(`(?:${TEST_LIKE}(?:\\.\\w+)*\\.(?:skip|fail)|(?<![\\w$.])(?:[\\w$]+\\.)+skipIf)\\s*\\(`);
const RUN_IF = /(?<![\w$.])(?:[\w$]+\.)+runIf\s*\(/;
const CONTEXT_SKIP = /(?<![\w$.])(?:[\w$]+(?:\.[\w$]+)*\.)?skip\s*\(/;
const ARROW = /^(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>\s*/;
const TRUTHY = /^(?:true|1|!0|!false|!!\s*(?:1|true|'[^']+'|"[^"]+")|([\w$.'"]+)\s*===?\s*\1)\s*[,)]/;
const FALSY = /^(?:false|0|!1|!true|!!\s*(?:0|false)|null|undefined|''|"")\s*[,)]/;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SYMLINK_MODE = /^(?:new file mode|new mode) 120000$/;
const EXECUTABLE_MODE = /^(?:(?:new file mode|new mode) 100755|index \S+ 100755)$/;
const BINARY = /^(?:Binary files .* differ|GIT binary patch)$/;

const DECLARATION = /^\s*(?:[-*]\s+)?Výjimka:\s*(?:`([^`]+)`|(\S+?))(?::\s*(.*))?$/;
const MINIMUM_REASON = 10;
const C_ESCAPES = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };

function unquote(text) {
  if (!text.startsWith('"')) return text;
  const quoted = Buffer.from(text.slice(1, text.lastIndexOf('"')), 'utf8');
  const bytes = [];
  for (let index = 0; index < quoted.length; index += 1) {
    if (quoted[index] !== 0x5c) {
      bytes.push(quoted[index]);
      continue;
    }
    const octal = /^[0-7]{3}/.exec(quoted.subarray(index + 1, index + 4).toString('latin1'));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      index += 3;
    } else {
      bytes.push(C_ESCAPES[String.fromCharCode(quoted[index + 1])] ?? quoted[index + 1]);
      index += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function headerPath(text, side) {
  const path = unquote(text.replace(/\t$/, ''));
  return path === '/dev/null' ? null : path.replace(new RegExp(`^${side}/`), '');
}

function gitHeaderPath(text) {
  const quoted = /^"(?:[^"\\]|\\.)*" ("(?:[^"\\]|\\.)*")$/.exec(text);
  if (quoted) return headerPath(quoted[1], 'b');
  const half = (text.length - 1) / 2;
  const [before, after] = [text.slice(0, half), text.slice(half + 1)];
  return before.startsWith('a/') && after.startsWith('b/') && before.slice(2) === after.slice(2) ? after.slice(2) : null;
}

function parseDiff(diff) {
  const files = [];
  let file = null;
  let hunk = null;
  let next = 0;
  for (const raw of diff.replace(/\r/g, '').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      file = { path: null, oldPath: null, movedFrom: null, movedTo: null, headerPath: gitHeaderPath(raw.slice(11)), binary: false, symlink: false, executable: false, added: [], removed: [] };
      files.push(file);
      hunk = null;
    } else if (!file) {
      continue;
    } else if (raw.startsWith('@@ ')) {
      const [, start, count] = /\+(\d+)(?:,(\d+))?/.exec(raw);
      next = Number(start);
      hunk = { lines: [], anchor: count === '0' ? Math.max(Number(start), 1) : Number(start) };
    } else if (!hunk) {
      if (BINARY.test(raw)) file.binary = true;
      if (SYMLINK_MODE.test(raw)) file.symlink = true;
      if (EXECUTABLE_MODE.test(raw)) file.executable = true;
      if (raw.startsWith('--- ')) file.oldPath = headerPath(raw.slice(4), 'a');
      if (raw.startsWith('+++ ')) file.path = headerPath(raw.slice(4), 'b');
      if (/^(?:rename|copy) from /.test(raw)) file.movedFrom = unquote(raw.replace(/^(?:rename|copy) from /, ''));
      if (/^(?:rename|copy) to /.test(raw)) file.movedTo = unquote(raw.replace(/^(?:rename|copy) to /, ''));
    } else if (raw.startsWith('+')) {
      const line = { line: next, text: raw.slice(1), hunk: hunk.lines, index: hunk.lines.length };
      hunk.lines.push(line);
      file.added.push(line);
      next += 1;
    } else if (raw.startsWith('-')) {
      file.removed.push({ anchor: hunk.anchor, text: raw.slice(1) });
    }
  }
  return files
    .map((entry) => {
      const deleted =
        !entry.path && !entry.movedTo && (ALWAYS_JUDGED.has(entry.oldPath) || WHOLE_FILE_RULES.some((rule) => rule.matches(entry.oldPath ?? '')));
      const unread = entry.binary || entry.symlink;
      return { ...entry, deleted, path: entry.path ?? entry.movedTo ?? (deleted ? entry.oldPath : null) ?? (unread ? entry.headerPath : null) };
    })
    .filter((entry) => entry.path);
}

function argumentsOf(call, { text, hunk, index }) {
  const following = hunk.slice(index + 1).map((line) => line.text);
  return [text.slice(call.index + call[0].length), ...following].join('\n').trimStart();
}

function skipsAlways(text) {
  if (text === '' || /^['"`)]/.test(text)) return true;
  return TRUTHY.test(text.replace(ARROW, ''));
}

function neverRuns(text) {
  if (text === '' || text.startsWith(')')) return true;
  return FALSY.test(text.replace(ARROW, ''));
}

function lineStarts(content) {
  const starts = [0];
  for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) starts.push(index + 1);
  return starts;
}

function lineAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

function closingBracket(content, open, opening = '[', closing = ']') {
  let depth = 0;
  let quote = null;
  for (let index = open; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === opening) {
      depth += 1;
    } else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return content.length - 1;
}

function relaxingListLines(path, content) {
  const lines = new Map();
  if (!content) return lines;
  const starts = lineStarts(content);
  if (PACKAGE_JSON.test(path)) {
    for (const match of content.matchAll(PACKAGE_SCRIPTS)) {
      const first = lineAt(starts, match.index);
      const last = lineAt(starts, closingBracket(content, match.index + match[0].length - 1, '{', '}'));
      for (let line = first; line <= last; line += 1) lines.set(line, '"scripts" of a package.json');
    }
  }
  if (!LIST_FILES.some((files) => files.test(path))) return lines;
  for (const match of content.matchAll(RELAXING_LIST)) {
    const first = lineAt(starts, match.index);
    const last = lineAt(starts, closingBracket(content, match.index + match[0].length - 1));
    for (let line = first + 1; line <= last; line += 1) lines.set(line, `${match[1]} [ … ]`);
  }
  if (ESLINT.test(path) || STYLELINT.test(path)) {
    for (const match of content.matchAll(RULE_LOOSENED)) {
      lines.set(lineAt(starts, match.index), 'a rule loosened');
      lines.set(lineAt(starts, match.index + match[0].length - 1), 'a rule loosened');
    }
  }
  return lines;
}

function suppressionIn(path, entry) {
  for (const { files, pattern, kind } of PATTERNS) {
    const match = files.test(path) && pattern.exec(entry.text);
    if (match) return kind ?? match[0];
  }
  if (!SCRIPT.test(path)) return null;
  const call = CONDITIONAL_CALL.exec(entry.text);
  if (call && skipsAlways(argumentsOf(call, entry))) return call[0];
  const contextSkip = TEST_FILE.test(path) && CONTEXT_SKIP.exec(entry.text);
  if (contextSkip && skipsAlways(argumentsOf(contextSkip, entry))) return contextSkip[0];
  const run = RUN_IF.exec(entry.text);
  if (run && neverRuns(argumentsOf(run, entry))) return run[0];
  return null;
}

function finding(path, line, kind, text) {
  return { path, line, kind: kind.replace(/\s*\($/, '').trim(), text: text.trim() };
}

function wholeFileFinding({ path, added, removed, movedTo, deleted }) {
  const judgesRemovals = ALWAYS_JUDGED.has(path);
  if (!(added.length > 0 || movedTo || (judgesRemovals && (removed.length > 0 || deleted)))) return [];
  const line = deleted ? 1 : (added[0]?.line ?? removed[0]?.anchor ?? 1);
  return [finding(path, line, basename(path), added[0]?.text ?? '')];
}

function wholeFileChange({ path, added, removed, deleted }, label) {
  const changed = added.length + removed.length;
  const line = deleted ? 1 : (added[0]?.line ?? removed[0]?.anchor ?? 1);
  const extent = changed === 0 ? 'moved' : `${changed} line${changed === 1 ? '' : 's'}`;
  return finding(path, line, `a change to ${label} (${extent})`, added[0]?.text ?? '');
}

function wholeFileRule(file) {
  for (const rule of WHOLE_FILE_RULES) {
    const path = [file.movedFrom, file.path].find((candidate) => candidate && rule.matches(candidate));
    if (path) return { path, label: rule.label };
  }
  return null;
}

function removedStrictness(path, removed) {
  const found = [];
  for (const entry of removed) {
    const rule = REMOVED_STRICTNESS.find(({ files, pattern }) => files.test(path) && pattern.test(entry.text));
    if (rule) found.push(finding(path, entry.anchor, `removed ${rule.pattern.exec(entry.text)[0]}`, entry.text));
  }
  return found;
}

export function addedSuppressions(diff, readFile = () => null) {
  const found = [];
  for (const file of parseDiff(diff)) {
    const { path, movedFrom, added } = file;
    if (CONTROL_CHARACTER.test(path)) found.push(finding(path, 1, 'a file name with a control character', ''));
    const judged = [movedFrom, path].find((candidate) => ALWAYS_JUDGED.has(candidate));
    if (judged) {
      found.push(...wholeFileFinding({ ...file, path: judged }));
      continue;
    }
    const whole = wholeFileRule(file);
    if (whole) {
      found.push(wholeFileChange({ ...file, path: whole.path }, whole.label));
      continue;
    }
    if (path === GUARD_TESTS && (!movedFrom || movedFrom === GUARD_TESTS)) continue;
    if (file.binary || file.symlink) {
      found.push(finding(path, 1, file.binary ? 'a binary change the guard cannot read' : 'a symbolic link', ''));
      continue;
    }
    if (file.executable) {
      found.push(wholeFileChange(file, 'an executable file'));
      continue;
    }
    if (DECIDED_FILES.has(path) || RELAXING_FILES.has(basename(path))) {
      found.push(...wholeFileFinding(file));
      continue;
    }
    if (movedFrom && TEST_FILE.test(movedFrom) && !TEST_FILE.test(path)) {
      found.push(finding(path, added[0]?.line ?? 1, 'a test file renamed out of its runner', `${movedFrom} → ${path}`));
    }
    const lists = relaxingListLines(path, readFile(path));
    for (const entry of added) {
      const kind = suppressionIn(path, entry) ?? lists.get(entry.line);
      if (kind) found.push(finding(path, entry.line, kind, entry.text));
    }
    found.push(...removedStrictness(path, file.removed));
  }
  return found;
}

function visibleLines(text) {
  const uncommented = text.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!--[\s\S]*$/, '');
  const lines = [];
  let fence = null;
  for (const line of uncommented.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker && (!fence || marker[1].startsWith(fence))) {
      fence = fence ? null : marker[1];
    } else if (!fence) {
      lines.push(line);
    }
  }
  return lines;
}

export function readDeclarations(text) {
  const declared = new Map();
  const rejected = [];
  for (const line of visibleLines(text)) {
    const match = DECLARATION.exec(line);
    if (!match) continue;
    const path = match[1] ?? match[2];
    const reason = (match[3] ?? '').trim();
    if (reason.replace(/<[^<>]*>/g, '').trim().length >= MINIMUM_REASON) {
      declared.set(path, reason);
    } else {
      rejected.push({ path, reason });
    }
  }
  return { declared, rejected };
}

export function undeclaredSuppressions(found, declared) {
  return found.filter(({ path }) => !declared.has(path));
}

export function readerFor(root) {
  const realRoot = realpathSync(root);
  return (path) => {
    try {
      const full = resolve(realRoot, path);
      if (!lstatSync(full).isFile() || !realpathSync(full).startsWith(realRoot + sep)) return null;
      return readFileSync(full, 'utf8');
    } catch {
      return null;
    }
  };
}

function escapeData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(text) {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function main(argv) {
  const options = Object.fromEntries(
    argv.map((argument) => /^--(diff|declared|root)=(.+)$/.exec(argument)).filter(Boolean).map((match) => [match[1], match[2]]),
  );
  if (!options.diff || !options.declared) {
    console.error(
      'Usage: node scripts/suppression-guard.mjs --diff=<git -c core.quotePath=false diff --unified=0 of the change> --declared=<the pull request description> [--root=<the change\'s files, default .>]',
    );
    console.error('  fails when an added line suppresses a check or skips a test and no "Výjimka: <path>: <reason>" line of the description names its file');
    return 2;
  }
  const found = addedSuppressions(readFileSync(options.diff, 'utf8'), readerFor(options.root ?? '.'));
  const { declared, rejected } = readDeclarations(readFileSync(options.declared, 'utf8'));
  const undeclared = undeclaredSuppressions(found, declared);

  for (const { path, line, kind, text } of found) {
    const reason = declared.get(path);
    console.log(escapeData(`- ${path}:${line}: ${kind} (${text})${reason ? ` declared: ${reason}` : ''}`));
  }
  for (const { path, reason } of rejected) {
    console.log(
      escapeData(`The line "Výjimka: ${path}: ${reason}" does not count: its reason must say why in at least ${MINIMUM_REASON} characters besides any <placeholder>.`),
    );
  }
  if (undeclared.length === 0) {
    console.log(found.length === 0 ? 'The change adds no suppression and skips no test.' : 'Every suppression the change adds is declared.');
    return 0;
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const { path, line, kind } of undeclared) {
      console.log(`::error file=${escapeProperty(path)},line=${line}::${escapeData(`${kind} without a "Výjimka: ${path}: <reason>" line in the description`)}`);
    }
  }
  console.log('');
  console.log(
    'The change adds a suppression or skips a test without a reason. Fix it, or, if it must stay, add these lines to the description with the reason (one line covers every suppression of its file); editing the description runs the check Výjimky again:',
  );
  for (const path of new Set(undeclared.map((entry) => entry.path))) {
    console.log(escapeData(`Výjimka: ${path}: <důvod>`));
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
