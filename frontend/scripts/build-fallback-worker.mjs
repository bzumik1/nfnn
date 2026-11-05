import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const FALLBACK_WORKER_FILE = new URL(
  '../../deploy/cloudflare/nfnn-fallback-worker.mjs',
  import.meta.url,
);

const PAGE_TEMPLATE = new URL('./fallback-page/page.html', import.meta.url);
const WORKER_TEMPLATE = new URL('./fallback-page/worker.mjs', import.meta.url);
const LOGO = new URL('../public/images/logo.svg', import.meta.url);
const QR_ENCODER = new URL('../src/app/shared/ui/qr-code/qr-encoder.ts', import.meta.url);
const SHARED_CASES = new URL('../../shared-cases/', import.meta.url);
const QUIET_ZONE = 4;

let typeScriptLoader = false;

function loadTypeScript() {
  if (typeScriptLoader) {
    return;
  }
  typeScriptLoader = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        context.parentURL?.endsWith('.ts') &&
        specifier.startsWith('.') &&
        !/\.\w+$/.test(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith('file:') || !url.endsWith('.ts')) {
        return nextLoad(url, context);
      }
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    },
  });
}

function caseOf(file, name) {
  const cases = JSON.parse(readFileSync(new URL(file, SHARED_CASES), 'utf8')).cases;
  const found = cases.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`shared-cases/${file} has no case named "${name}"`);
  }
  return found.expected;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

function qrSvg(symbol, label) {
  const size = symbol.size + 2 * QUIET_ZONE;
  const squares = [];
  for (let row = 0; row < symbol.size; row++) {
    for (let column = 0; column < symbol.size; column++) {
      if (symbol.modules.charAt(row * symbol.size + column) === '1') {
        squares.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }
  return (
    `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size * 6}" height="${size * 6}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="${escapeHtml(label)}"><rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path fill="#000000" d="${squares.join('')}"/></svg>`
  );
}

function logoSvg() {
  return readFileSync(LOGO, 'utf8')
    .trim()
    .replace(/<title>[^<]*<\/title>\s*/, '')
    .replace(/\s+id="[^"]*"/g, '')
    .replace(/^<svg /, '<svg class="logo" role="img" aria-label="Nová naděje, nadační fond" ');
}

export async function buildFallbackWorker() {
  loadTypeScript();
  const { encodeText } = await import(QR_ENCODER.href);
  const details = caseOf('payment/details.json', "the foundation's account");
  const donation = caseOf('payment/spayd.json', '1 000 Kč without a variable symbol').spayd;
  const textWithoutAmount = donation.replace(/\*AM:[^*]+/, '');
  const accountNumber = details.account.number;
  const iban = details.account.iban.replace(/(.{4})(?=.)/g, '$1 ');
  const page = readFileSync(PAGE_TEMPLATE, 'utf8')
    .replace('{{ logo }}', logoSvg())
    .replace(
      '{{ qr }}',
      qrSvg(
        encodeText(textWithoutAmount, 'H'),
        `QR kód platby na účet ${accountNumber} bez částky`,
      ),
    )
    .replace('{{ accountNumber }}', escapeHtml(accountNumber))
    .replace('{{ iban }}', escapeHtml(iban));
  const styles = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  if (styles.length !== 1 || /\{\{ ?\w+ ?\}\}/.test(page)) {
    throw new Error('the fallback page needs exactly one <style> block and no placeholder left');
  }
  const styleHash = createHash('sha256').update(styles[0][1]).digest('base64');
  const policy = `default-src 'none'; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return readFileSync(WORKER_TEMPLATE, 'utf8')
    .replace("'__FALLBACK_PAGE__'", () => JSON.stringify(page))
    .replace("'__FALLBACK_POLICY__'", () => JSON.stringify(policy));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = await buildFallbackWorker();
  if (process.argv.includes('--check')) {
    if (readFileSync(FALLBACK_WORKER_FILE, 'utf8') !== built) {
      console.error(
        'deploy/cloudflare/nfnn-fallback-worker.mjs is out of date: run `npm run edge:fallback` in frontend/',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(FALLBACK_WORKER_FILE, built);
    console.log(`wrote ${fileURLToPath(FALLBACK_WORKER_FILE)}`);
  }
}
