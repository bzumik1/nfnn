import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const app = join(frontend, 'src', 'app');

export const WORKS_WITHOUT_CONNECTION = {
  'features/donations/verification/proof-input.html':
    'Reading a receipt code checks it in the browser against the keys it keeps, offline too (frontend.md, Receipt verification).',
  'layout/offline-status/offline-status.html#tryAgain':
    'It is the probe that ends the offline state, so it must run while offline.',
  'features/donors/login-dialog/login-dialog.html#tryConnectionAgain':
    "It is the probe that ends the offline state, as the offline sheet's Zkusit znovu, so it must run while offline.",
  'layout/account-sheet/account-sheet.html#signOut':
    'AuthStore.logout forgets the session on the device when the server cannot be reached, so signing out from the account sheet works offline.',
  'features/donors/connect-app/connect-app.html#switchAccount':
    'It signs out through AuthStore.logout, which works offline, and then opens the sign-in dialog.',
  'features/donors/dashboard/device-data-card/delete-device-data-dialog.html':
    'Deleting the copy on this device is local, and the sign-out after it goes through AuthStore.logout, which works offline, so a device without a connection can still drop its data.',
  'features/operations/setup/first-setup.html#openRestore':
    'It only switches the wizard to the restore panel.',
  'features/operations/setup/first-setup.html#closeRestore':
    'It only switches the wizard back to the form; the backup key it loads again fails with its own retry.',
};

const BUTTON = /<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const DIRECTIVE = /(^|\s)appNeedsConnection(?=[\s=>/])/;
const SUBMIT = /\btype\s*=\s*"submit"/;
const ANY_TYPE = /\s(?:type|\[type\]|\[attr\.type\])\s*=/;
const CLASS = /\sclass\s*=\s*"([^"]*)"/;
const CHANGE_CLASSES = new Set(['ui-button--danger', 'ui-button--danger-soft']);
const CLICK = /\(click\)\s*=\s*"([^"]*)"/;
const CALLED = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
const METHOD =
  /^ {2}(?:(?:protected|private|public|async|static|override)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{=;]+)?\{/gm;
const OWN_CALL = /this\.([A-Za-z_$][\w$]*)\s*\(/g;
const REACHES_SERVER = /\.subscribe\s*\(|\bfirstValueFrom\s*\(|\blastValueFrom\s*\(/;

export function controlsWithoutDirective(template, component = '', worksOffline = new Set()) {
  const reaches = serverReach(component);
  const missing = [];
  for (const match of template.matchAll(BUTTON)) {
    const tag = match[0];
    if (needsConnection(tag, reaches, worksOffline) && !DIRECTIVE.test(tag)) {
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

function needsConnection(tag, reaches, worksOffline) {
  if (SUBMIT.test(tag) || !ANY_TYPE.test(tag)) {
    return true;
  }
  const click = CLICK.exec(tag)?.[1] ?? '';
  const called = [...click.matchAll(CALLED)].map(([, name]) => name);
  const classes = (CLASS.exec(tag)?.[1] ?? '').split(/\s+/);
  if (classes.some((name) => CHANGE_CLASSES.has(name))) {
    return called.length === 0 || called.some((name) => !worksOffline.has(name));
  }
  return called.some((name) => !worksOffline.has(name) && reaches(name));
}

function methodBodies(component) {
  const bodies = new Map();
  for (const match of component.matchAll(METHOD)) {
    let end = match.index + match[0].length;
    for (let depth = 1; depth > 0 && end < component.length; end++) {
      if (component[end] === '{') {
        depth++;
      } else if (component[end] === '}') {
        depth--;
      }
    }
    bodies.set(match[1], component.slice(match.index + match[0].length, end));
  }
  return bodies;
}

function serverReach(component) {
  const bodies = methodBodies(component);
  const known = new Map();
  const reaches = (name, visiting = new Set()) => {
    if (known.has(name)) {
      return known.get(name);
    }
    const body = bodies.get(name);
    if (body === undefined || visiting.has(name)) {
      return false;
    }
    visiting.add(name);
    const result =
      REACHES_SERVER.test(body) ||
      [...body.matchAll(OWN_CALL)].some(([, called]) => reaches(called, visiting));
    known.set(name, result);
    return result;
  };
  return (name) => reaches(name);
}

function offlineHandlers(file, exceptions) {
  return new Set(
    Object.keys(exceptions)
      .filter((key) => key.startsWith(`${file}#`))
      .map((key) => key.slice(file.length + 1)),
  );
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

export function findings(exceptions = WORKS_WITHOUT_CONNECTION) {
  const found = [];
  const files = templates(app).map((path) => relative(app, path).split('\\').join('/'));
  for (const key of Object.keys(exceptions)) {
    const [file, handler] = key.split('#');
    const template = files.includes(file) ? readFileSync(join(app, file), 'utf8') : null;
    const calls =
      handler === undefined ||
      new RegExp(`\\(click\\)="[^"]*\\b${handler}\\(`).test(template ?? '');
    if (template === null || !calls) {
      found.push(`${key}: listed as working without a connection, but no such control exists`);
    }
  }
  for (const path of templates(app)) {
    const file = relative(app, path).split('\\').join('/');
    const template = readFileSync(path, 'utf8');
    const componentPath = path.replace(/\.html$/, '.ts');
    const component = existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : '';
    if (!(file in exceptions)) {
      for (const control of controlsWithoutDirective(
        template,
        component,
        offlineHandlers(file, exceptions),
      )) {
        found.push(`${file}:${control.line} ${control.tag.replace(/\s+/g, ' ')}`);
      }
    }
    if (usesDirective(template)) {
      if (!importsDirective(component)) {
        found.push(
          `${file}: uses appNeedsConnection, but its component does not import NeedsConnection`,
        );
      }
    }
  }
  return found;
}
