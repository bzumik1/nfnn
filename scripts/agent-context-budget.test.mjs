import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import {
  declaredGrowth,
  frontmatterOf,
  grownOver,
  isPathScoped,
  measure,
} from './agent-context-budget.mjs';

const SCRIPT = fileURLToPath(new URL('agent-context-budget.mjs', import.meta.url));
const folders = [];

const ALWAYS_RULE = '# Security rules\n\nNever log a token.\n';
const SCOPED_RULE = '---\npaths:\n  - "deploy/**"\n---\n# Deployment\n';
const SKILL =
  '---\nname: visual-check\ndescription: Screenshot a change\nallowed-tools: Bash\n---\n# Body\n';
const AGENT =
  '---\nname: java-expert\ndescription: Use for backend work\nmodel: inherit\n---\nLong body text\n';
const TOOLS = [{ name: 'nfnn_status', description: 'Stav', inputSchema: { type: 'object' } }];
const INSTRUCTIONS = 'Tools of the administration.';

const connectorModule = ({ tools, instructions }) =>
  [
    `export const connectorToolList = async () => (${JSON.stringify(tools)});`,
    instructions === null
      ? ''
      : `export const connectorInstructions = async () => ${JSON.stringify(instructions)};`,
  ].join('\n');

function repository({
  claude = '# CLAUDE.md\n',
  rules = {},
  tools = TOOLS,
  instructions = INSTRUCTIONS,
  connector = 'built',
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agent-context-budget-'));
  folders.push(root);
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('CLAUDE.md', claude);
  for (const [name, text] of Object.entries({
    'security.md': ALWAYS_RULE,
    'deploy-ci.md': SCOPED_RULE,
    ...rules,
  })) {
    write(`.claude/rules/${name}`, text);
  }
  write('.claude/skills/visual-check/SKILL.md', SKILL);
  write('.claude/agents/java-expert.md', AGENT);
  if (connector !== 'absent') {
    write('mcp/src/tool-list.ts', '');
  }
  if (connector === 'built') {
    write('mcp/dist/tool-list.js', connectorModule({ tools, instructions }));
  }
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, `--root=${root}`, ...args], { encoding: 'utf8' });
}

function description(root, text) {
  const path = join(root, 'description.md');
  writeFileSync(path, text);
  return `--description=${path}`;
}

const bytes = (text) => Buffer.byteLength(text, 'utf8');

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe('Given rule files with and without frontmatter', () => {
  it('when a rule names paths in its frontmatter, then it is path-scoped', () => {
    assert.equal(isPathScoped(SCOPED_RULE), true);
  });

  it('when a rule has no frontmatter, then it loads always', () => {
    assert.equal(isPathScoped(ALWAYS_RULE), false);
  });

  it('when a rule has frontmatter without paths, then it loads always', () => {
    assert.equal(isPathScoped('---\ndescription: x\n---\n# Rule\n'), false);
  });

  it('when paths appears only in the body, then it loads always', () => {
    assert.equal(isPathScoped('# Rule\n\npaths:\n  - "x"\n'), false);
  });

  it('when the frontmatter uses CRLF line ends, then paths is still found', () => {
    assert.equal(isPathScoped('---\r\npaths:\r\n  - "x"\r\n---\r\n# Rule\r\n'), true);
  });

  it('when the file starts with a byte order mark, then its frontmatter is still read', () => {
    assert.equal(isPathScoped(`\uFEFF${SCOPED_RULE}`), true);
  });

  it('when the frontmatter is read, then only the text between the two fences is returned', () => {
    assert.equal(
      frontmatterOf(SKILL),
      'name: visual-check\ndescription: Screenshot a change\nallowed-tools: Bash',
    );
    assert.equal(frontmatterOf(ALWAYS_RULE), undefined);
  });
});

describe('Given a repository with CLAUDE.md, rules, a skill, an agent and a built connector', () => {
  it('when it is measured, then each value counts the bytes that land in an agent context', async () => {
    const root = repository({ claude: '# Pravidla – čeština\n' });

    assert.deepEqual(await measure(root), {
      alwaysLoadedBytes: bytes('# Pravidla – čeština\n') + bytes(ALWAYS_RULE),
      pathScopedBytes: bytes(SCOPED_RULE),
      skillDescriptionsBytes:
        bytes('visual-check') +
        bytes('Screenshot a change') +
        bytes('java-expert') +
        bytes('Use for backend work'),
      connectorToolListBytes: bytes(JSON.stringify(TOOLS)),
      connectorInstructionsBytes: bytes(INSTRUCTIONS),
    });
  });

  it('when a rule lies in a subfolder of the rules, then it is measured too', async () => {
    const nested = '---\npaths:\n  - "frontend/**"\n---\n# Nested\n';

    const measured = await measure(
      repository({ rules: { 'frontend/forms.md': nested, 'shared/always.md': ALWAYS_RULE } }),
    );

    assert.equal(measured.pathScopedBytes, bytes(SCOPED_RULE) + bytes(nested));
    assert.equal(measured.alwaysLoadedBytes, bytes('# CLAUDE.md\n') + 2 * bytes(ALWAYS_RULE));
  });

  it('when a rule gains paths in its frontmatter, then its bytes move from always loaded to path-scoped', async () => {
    const before = await measure(repository());
    const scoped = `---\npaths:\n  - "backend/**"\n---\n${ALWAYS_RULE}`;

    const after = await measure(repository({ rules: { 'security.md': scoped } }));

    assert.equal(after.alwaysLoadedBytes, before.alwaysLoadedBytes - bytes(ALWAYS_RULE));
    assert.equal(after.pathScopedBytes, before.pathScopedBytes + bytes(scoped));
  });

  it('when the tree has no connector tool list yet, then the connector values are left out', async () => {
    const measured = await measure(repository({ connector: 'absent' }));

    assert.equal('connectorToolListBytes' in measured, false);
    assert.equal('connectorInstructionsBytes' in measured, false);
  });

  it('when the connector lists its tools but gives no instructions yet, then only the instructions are left out', async () => {
    const measured = await measure(repository({ instructions: null }));

    assert.equal(measured.connectorToolListBytes, bytes(JSON.stringify(TOOLS)));
    assert.equal('connectorInstructionsBytes' in measured, false);
  });

  it('when the connector has a tool list but is not built, then the measurement fails and says how to build it', () => {
    const measured = run(repository({ connector: 'source-only' }));

    assert.equal(measured.status, 2);
    assert.match(measured.stderr, /npm run build/);
  });
});

describe('Given a base and a head measurement', () => {
  const base = {
    alwaysLoadedBytes: 100,
    pathScopedBytes: 50,
    skillDescriptionsBytes: 20,
    connectorToolListBytes: 1000,
    connectorInstructionsBytes: 300,
  };

  it('when no value grew, then nothing is reported', () => {
    assert.deepEqual(grownOver(base, { ...base, alwaysLoadedBytes: 90 }), []);
  });

  it('when the always-loaded context and the instructions grew, then both are reported with their values', () => {
    assert.deepEqual(
      grownOver(base, { ...base, alwaysLoadedBytes: 130, connectorInstructionsBytes: 301 }),
      [
        { key: 'alwaysLoadedBytes', base: 100, head: 130 },
        { key: 'connectorInstructionsBytes', base: 300, head: 301 },
      ],
    );
  });

  it('when only the path-scoped rules grew, then nothing is reported, because they load only with their files', () => {
    assert.deepEqual(grownOver(base, { ...base, pathScopedBytes: 500 }), []);
  });

  it('when the head no longer measures a value the base has, then it is reported as no longer measured', () => {
    const { connectorInstructionsBytes: _, ...head } = base;

    assert.deepEqual(grownOver(base, head), [
      { key: 'connectorInstructionsBytes', base: 300, head: undefined },
    ]);
  });

  it('when the base lacks a value the head has, then that value is not compared', () => {
    const { connectorInstructionsBytes: _, ...older } = base;

    assert.deepEqual(grownOver(older, { ...base, connectorInstructionsBytes: 9000 }), []);
  });
});

describe('Given a pull request description', () => {
  it('when it declares the growth with a reason on a line of its own, then the reason is read', () => {
    assert.equal(
      declaredGrowth(
        'Roadmapa: beze změny\r\nKontext agenta roste: the new receipt rule must load always\r\n',
      ),
      'the new receipt rule must load always',
    );
  });

  it('when the line holds only the template comment, then no growth is declared', () => {
    assert.equal(declaredGrowth('Kontext agenta roste: <!-- reason -->\n'), undefined);
  });

  it('when the reason sits beside a comment, then only the reason is read', () => {
    assert.equal(
      declaredGrowth('Kontext agenta roste: <!-- why --> a new connector tool\n'),
      'a new connector tool',
    );
  });

  it('when the whole line sits inside a comment, then no growth is declared', () => {
    assert.equal(declaredGrowth('<!--\nKontext agenta roste: a reason\n-->\n'), undefined);
  });

  it('when the pull request template is left as it is, then no growth is declared', () => {
    const template = readFileSync(
      fileURLToPath(new URL('../.github/pull_request_template.md', import.meta.url)),
      'utf8',
    );

    assert.match(template, /^Kontext agenta roste:/m);
    assert.equal(declaredGrowth(template), undefined);
  });

  it('when the reason is a placeholder in angle brackets, then no growth is declared', () => {
    assert.equal(declaredGrowth('Kontext agenta roste: <důvod>\n'), undefined);
  });

  it('when the line has no reason or stands mid-sentence, then no growth is declared', () => {
    assert.equal(declaredGrowth('Kontext agenta roste:   \n'), undefined);
    assert.equal(declaredGrowth('We write `Kontext agenta roste: x` when it grows.\n'), undefined);
    assert.equal(declaredGrowth(''), undefined);
  });
});

describe('Given a base tree and a head tree', () => {
  it('when the head grew and the description declares nothing, then the comparison fails naming the value', () => {
    const head = repository({ claude: '# CLAUDE.md\nOne more line.\n' });
    const base = repository();

    const compared = run(head, `--base=${base}`, description(head, 'Vzhled: beze změny\n'));

    assert.equal(compared.status, 1);
    assert.match(compared.stderr, /alwaysLoadedBytes: \d+ -> \d+ \(\+15\)/);
    assert.match(compared.stderr, /Kontext agenta roste:/);
  });

  it('when the head grew and the description declares it, then the comparison passes and prints the reason', () => {
    const head = repository({ tools: [...TOOLS, ...TOOLS] });
    const base = repository();

    const compared = run(
      head,
      `--base=${base}`,
      description(head, 'Kontext agenta roste: a new connector tool\n'),
    );

    assert.equal(compared.status, 0, compared.stderr);
    assert.match(compared.stdout, /a new connector tool/);
  });

  it('when the head grew and only a report is asked, then it passes and prints the growth', () => {
    const head = repository({ claude: '# CLAUDE.md\nOne more line.\n' });

    const compared = run(head, `--base=${repository()}`, '--report-only');

    assert.equal(compared.status, 0, compared.stderr);
    assert.match(compared.stdout, /alwaysLoadedBytes: \d+ -> \d+ \(\+15\)/);
  });

  it('when the head no longer has the connector tool list, then the comparison fails naming the values no longer measured', () => {
    const compared = run(repository({ connector: 'absent' }), `--base=${repository()}`);

    assert.equal(compared.status, 1);
    assert.match(compared.stderr, /connectorToolListBytes: \d+ -> no longer measured/);
    assert.match(compared.stderr, /connectorInstructionsBytes: \d+ -> no longer measured/);
  });

  it('when the head no longer has the connector tool list and the description declares it, then the comparison passes', () => {
    const head = repository({ connector: 'absent' });

    const compared = run(
      head,
      `--base=${repository()}`,
      description(head, 'Kontext agenta roste: the connector moves to its own repository\n'),
    );

    assert.equal(compared.status, 0, compared.stderr);
  });

  it('when the base has no connector tool list yet, then the head passes without a declaration', () => {
    const compared = run(repository(), `--base=${repository({ connector: 'absent' })}`);

    assert.equal(compared.status, 0, compared.stderr);
  });

  it('when a summary file is named, then both sets of numbers are appended as a table', () => {
    const head = repository({ claude: '# CLAUDE.md\nOne more line.\n' });
    const summary = join(head, 'summary.md');
    writeFileSync(summary, 'earlier\n');

    run(
      head,
      `--base=${repository({ connector: 'absent' })}`,
      `--summary=${summary}`,
      '--report-only',
    );

    const table = readFileSync(summary, 'utf8');
    assert.match(table, /^earlier\n/);
    assert.match(table, /\| alwaysLoadedBytes \| \d+ \| \d+ \| \+15 \|/);
    assert.match(table, /\| connectorToolListBytes \| – \| \d+ \| – \|/);
  });

  it('when no base is named, then the head is measured and reported', () => {
    const head = repository();
    const summary = join(head, 'summary.md');

    const measured = run(head, `--summary=${summary}`);

    assert.equal(measured.status, 0, measured.stderr);
    assert.match(readFileSync(summary, 'utf8'), /\| alwaysLoadedBytes \| \d+ \|/);
  });
});
