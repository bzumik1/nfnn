import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const app = join(frontend, 'src', 'app');

export const WORKS_WITHOUT_CONNECTION = {
  'features/donations/verification/proof-input.html':
    'Reading a receipt code checks it in the browser against the keys it keeps, offline too (frontend.md, Receipt verification).',
};

const BUTTON = /<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const DIRECTIVE = /(^|\s)appNeedsConnection(?=[\s=>/])/;
const SUBMIT = /\btype\s*=\s*"submit"/;
const CLASS = /\sclass\s*=\s*"([^"]*)"/;
const CHANGE_CLASSES = new Set(['ui-button--danger', 'ui-button--danger-soft']);

export function controlsWithoutDirective(template) {
  const missing = [];
  for (const match of template.matchAll(BUTTON)) {
    const tag = match[0];
    if (needsConnection(tag) && !DIRECTIVE.test(tag)) {
      missing.push({ line: template.slice(0, match.index).split('\n').length, tag });
    }
  }
  return missing;
}

export function usesDirective(template) {
  return [...template.matchAll(BUTTON)].some((match) => DIRECTIVE.test(match[0]));
}

export function importsDirective(component) {
  return /\bimports\s*:\s*\[[^\]]*\bNeedsConnection\b/s.test(component);
}

function needsConnection(tag) {
  if (SUBMIT.test(tag)) {
    return true;
  }
  const classes = (CLASS.exec(tag)?.[1] ?? '').split(/\s+/);
  return classes.some((name) => CHANGE_CLASSES.has(name));
}

function templates(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return templates(path);
    }
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

export function findings() {
  const found = [];
  for (const path of templates(app)) {
    const file = relative(app, path).split('\\').join('/');
    const template = readFileSync(path, 'utf8');
    if (!(file in WORKS_WITHOUT_CONNECTION)) {
      for (const control of controlsWithoutDirective(template)) {
        found.push(`${file}:${control.line} ${control.tag.replace(/\s+/g, ' ')}`);
      }
    }
    if (usesDirective(template)) {
      const component = readFileSync(path.replace(/\.html$/, '.ts'), 'utf8');
      if (!importsDirective(component)) {
        found.push(
          `${file}: uses appNeedsConnection, but its component does not import NeedsConnection`,
        );
      }
    }
  }
  return found;
}
