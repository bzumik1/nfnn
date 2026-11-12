#!/usr/bin/env node
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VALUES = [
  'alwaysLoadedBytes',
  'pathScopedBytes',
  'skillDescriptionsBytes',
  'connectorToolListBytes',
  'connectorInstructionsBytes',
];
export const BUDGETED = VALUES.filter((key) => key !== 'pathScopedBytes');
const DECLARATION = /^[ \t]*Kontext agenta roste:[ \t]*(\S.*?)[ \t]*$/im;
const PLACEHOLDER = /^<[^<>]*>$/;

export function frontmatterOf(text) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return match ? match[1].replace(/\r\n/g, '\n') : undefined;
}

export function isPathScoped(text) {
  return /^paths:/m.test(frontmatterOf(text) ?? '');
}

function fieldOf(frontmatter, name) {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${name}:`));
  if (start < 0) {
    return '';
  }
  const continuation = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) {
      break;
    }
    continuation.push(line.trim());
  }
  return [lines[start].slice(name.length + 1).trim(), ...continuation].filter(Boolean).join('\n');
}

const bytes = (text) => Buffer.byteLength(text, 'utf8');
const read = (path) => readFileSync(path, 'utf8');
const sum = (texts) => texts.reduce((total, text) => total + bytes(text), 0);

function markdownUnder(folder) {
  if (!existsSync(folder)) {
    return [];
  }
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => relative(folder, a).localeCompare(relative(folder, b)));
}

function describedFiles(root) {
  const skills = join(root, '.claude/skills');
  const skillFiles = existsSync(skills)
    ? readdirSync(skills)
        .sort()
        .map((name) => join(skills, name, 'SKILL.md'))
        .filter(existsSync)
    : [];
  const agents = join(root, '.claude/agents');
  const agentFiles = existsSync(agents)
    ? readdirSync(agents)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(agents, name))
    : [];
  return [...skillFiles, ...agentFiles];
}

async function connectorOf(root) {
  if (!existsSync(join(root, 'mcp/src/tool-list.ts'))) {
    return {};
  }
  const built = join(root, 'mcp/dist/tool-list.js');
  if (!existsSync(built)) {
    throw new Error(
      `the connector of ${root} is not built: run \`npm ci && npm run build\` in its mcp/ first, so its tool list can be measured`,
    );
  }
  const module = await import(pathToFileURL(built).href);
  return {
    tools: await module.connectorToolList(),
    instructions: module.connectorInstructions ? await module.connectorInstructions() : undefined,
  };
}

export async function measure(root) {
  const rules = markdownUnder(join(root, '.claude/rules')).map(read);
  const { tools, instructions } = await connectorOf(root);
  return {
    alwaysLoadedBytes:
      bytes(read(join(root, 'CLAUDE.md'))) + sum(rules.filter((rule) => !isPathScoped(rule))),
    pathScopedBytes: sum(rules.filter(isPathScoped)),
    skillDescriptionsBytes: sum(
      describedFiles(root).flatMap((path) => {
        const frontmatter = frontmatterOf(read(path)) ?? '';
        return [fieldOf(frontmatter, 'name'), fieldOf(frontmatter, 'description')];
      }),
    ),
    ...(tools !== undefined && { connectorToolListBytes: bytes(JSON.stringify(tools)) }),
    ...(instructions !== undefined && { connectorInstructionsBytes: bytes(instructions) }),
  };
}

export function grownOver(base, head) {
  return BUDGETED.filter(
    (key) =>
      typeof base[key] === 'number' && !(typeof head[key] === 'number' && head[key] <= base[key]),
  ).map((key) => ({ key, base: base[key], head: head[key] }));
}

export function declaredGrowth(description) {
  const reason = DECLARATION.exec(description.replace(/<!--[\s\S]*?-->/g, ''))?.[1];
  return reason && !PLACEHOLDER.test(reason) ? reason : undefined;
}

const signed = (change) => (change > 0 ? `+${change}` : String(change));
const shown = (value) => (value === undefined ? '–' : String(value));

function tableOf(head, base) {
  const present = VALUES.filter((key) => key in head || (base && key in base));
  if (!base) {
    return [
      '| Value | Bytes |',
      '|---|---|',
      ...present.map((key) => `| ${key} | ${shown(head[key])} |`),
    ];
  }
  return [
    '| Value | Base | Head | Change |',
    '|---|---|---|---|',
    ...present.map((key) => {
      const change =
        typeof base[key] === 'number' && typeof head[key] === 'number'
          ? signed(head[key] - base[key])
          : '–';
      return `| ${key} | ${shown(base[key])} | ${shown(head[key])} | ${change} |`;
    }),
  ];
}

function optionsOf(args) {
  const options = {};
  for (const arg of args) {
    const [name, ...value] = arg.replace(/^--/, '').split('=');
    options[name] = value.length ? value.join('=') : true;
  }
  return options;
}

function verdictOf(grown, options) {
  if (grown.length === 0) {
    return { status: 0, text: 'The agent context is not larger than the base.' };
  }
  const lines = grown
    .map(({ key, base, head }) =>
      head === undefined
        ? `  ${key}: ${base} -> no longer measured`
        : `  ${key}: ${base} -> ${head} (${signed(head - base)})`,
    )
    .join('\n');
  const grew = `The agent context grew over the base, or is no longer measured:\n${lines}`;
  if (options['report-only']) {
    return { status: 0, text: `${grew}\nReported only, not compared.` };
  }
  const reason = options.description ? declaredGrowth(read(options.description)) : undefined;
  if (reason) {
    return { status: 0, text: `${grew}\nDeclared: ${reason}` };
  }
  return {
    status: 1,
    text: `${grew}\nCut the added text or measure the value again, or declare the change in the PR description with a line "Kontext agenta roste: <reason>".`,
  };
}

async function main(args) {
  const options = optionsOf(args);
  const root = resolve(options.root ?? fileURLToPath(new URL('..', import.meta.url)));
  const head = await measure(root);
  const base = options.base ? await measure(resolve(options.base)) : undefined;
  const verdict = base ? verdictOf(grownOver(base, head), options) : undefined;
  const table = tableOf(head, base).join('\n');

  console.log(table);
  if (options.summary) {
    appendFileSync(
      options.summary,
      `## Kontext agenta\n\n${table}\n\n${verdict ? `${verdict.text}\n` : ''}`,
    );
  }
  if (!verdict) {
    return 0;
  }
  (verdict.status === 0 ? console.log : console.error)(verdict.text);
  return verdict.status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (status) => process.exit(status),
    (error) => {
      console.error(error.message);
      process.exit(2);
    },
  );
}
