#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_FILES = ['README.md'];
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const INLINE_CODE = /`[^`]*`/g;
const MARKDOWN_LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_ATTRIBUTE = /\b(?:src|href|srcset)="([^"]+)"/g;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

export function githubSlug(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

function linesOutsideCode(text) {
  const lines = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (!fenced) {
      lines.push({ number: index + 1, text: line });
    }
  });
  return lines;
}

function headingAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const { text: line } of linesOutsideCode(text)) {
    const match = HEADING.exec(line);
    if (!match) {
      continue;
    }
    const slug = githubSlug(match[1]);
    const count = seen.get(slug) ?? 0;
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
    seen.set(slug, count + 1);
  }
  return anchors;
}

function linksOf(text) {
  const links = [];
  for (const { number, text: line } of linesOutsideCode(text)) {
    const prose = line.replace(INLINE_CODE, '');
    for (const match of prose.matchAll(MARKDOWN_LINK)) {
      links.push({ line: number, target: match[1] });
    }
    for (const match of prose.matchAll(HTML_ATTRIBUTE)) {
      const first = match[1].split(',')[0].trim().split(/\s+/)[0];
      links.push({ line: number, target: first });
    }
  }
  return links;
}

function existsExactly(root, path) {
  let folder = root;
  for (const segment of normalize(path)
    .split('/')
    .filter((part) => part && part !== '.')) {
    if (segment === '..' || !existsSync(folder) || !readdirSync(folder).includes(segment)) {
      return false;
    }
    folder = join(folder, segment);
  }
  return true;
}

function anchorsOfFile(root, path, cache) {
  if (!cache.has(path)) {
    cache.set(path, headingAnchors(readFileSync(join(root, path), 'utf8')));
  }
  return cache.get(path);
}

export function brokenLinks(root, file) {
  const problems = [];
  const anchors = new Map();
  const folder = dirname(file);
  for (const { line, target } of linksOf(readFileSync(join(root, file), 'utf8'))) {
    if (EXTERNAL.test(target)) {
      continue;
    }
    const [rawPath, anchor] = target.split('#');
    const path = rawPath
      ? normalize(
          rawPath.startsWith('/')
            ? rawPath.slice(1)
            : join(folder, decodeURI(rawPath.split('?')[0])),
        )
      : file;
    if (!existsExactly(root, path)) {
      problems.push({ line, target, reason: 'no such file or folder' });
      continue;
    }
    if (
      anchor &&
      path.endsWith('.md') &&
      !anchorsOfFile(root, path, anchors).has(decodeURIComponent(anchor))
    ) {
      problems.push({ line, target, reason: 'no such heading' });
    }
  }
  return problems;
}

function main(args) {
  const rootArgument = args.find((arg) => arg.startsWith('--root='));
  const root = resolve(
    rootArgument
      ? rootArgument.slice('--root='.length)
      : join(dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const files = args.filter((arg) => !arg.startsWith('--'));
  let failed = false;
  for (const file of files.length > 0 ? files : DEFAULT_FILES) {
    for (const problem of brokenLinks(root, file)) {
      console.error(`${file}:${problem.line}: ${problem.target}: ${problem.reason}`);
      failed = true;
    }
  }
  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(
      'Every relative link of the checked Markdown leads to a file, folder or heading that exists.',
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
