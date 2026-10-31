import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const require = createRequire(import.meta.url);
const tseslint = require('typescript-eslint');
const {
  CONFINED_IMPORTS,
  SCOPES,
  confinedImports,
  scopeGlobs,
} = require('../eslint-confinement.js');

const frontend = fileURLToPath(new URL('..', import.meta.url));
const CONFINEMENT_RULES = [
  '@typescript-eslint/no-restricted-imports',
  'no-restricted-imports',
  'no-restricted-syntax',
];
const SOURCES = globSync('src/**/*.ts', { cwd: frontend }).sort();

function matching(patterns) {
  const sources = new Set(SOURCES);
  return new Set(
    patterns
      .flatMap((pattern) => globSync(pattern, { cwd: frontend }))
      .filter((file) => sources.has(file)),
  );
}

function filesOf(scopes) {
  return Object.fromEntries(
    Object.entries(scopeGlobs(scopes)).map(([scope, { files, ignores }]) => {
      const ignored = matching(ignores);
      return [scope, SOURCES.filter((file) => matching(files).has(file) && !ignored.has(file))];
    }),
  );
}

function emptyScopes(scopes) {
  return Object.entries(filesOf(scopes))
    .filter(([, files]) => files.length === 0)
    .map(([scope]) => scope);
}

const SCOPE_FILES = filesOf(SCOPES);
const projectLint = new ESLint({ cwd: frontend });

async function refusals(eslint, scope, text, files = SCOPE_FILES) {
  const [result] = await eslint.lintText(text, { filePath: join(frontend, files[scope][0]) });
  return result.messages.filter((message) => CONFINEMENT_RULES.includes(message.ruleId));
}

const staticImport = (module) => `import library from '${module}';\nexport const used = library;\n`;
const typeImport = (module) =>
  `import type { Thing } from '${module}';\nexport type Used = Thing;\n`;
const dynamicImport = (module) => `export const loaded = import('${module}');\n`;
const templateImport = (module) => `export const loaded = import(\`${module}\`);\n`;
const computedImport = `const name = 'a-module';\nexport const loaded = import(name);\n`;

describe('Given the scopes of the import confinement table', () => {
  it('when the source files are sorted into them, then every scope holds at least one file', () => {
    assert.deepEqual(emptyScopes(SCOPES), []);
  });

  it('when a scope names a glob that matches no file, then the check reports that scope', () => {
    const scopes = { ...SCOPES, gone: { files: ['src/**/no-such-adapter.ts'], within: 'app' } };

    assert.deepEqual(emptyScopes(scopes), ['gone']);
  });

  it('when the source files are sorted into them, then each file falls into exactly one scope', () => {
    const counted = SOURCES.map((file) => [
      file,
      Object.values(SCOPE_FILES).filter((files) => files.includes(file)).length,
    ]);

    assert.deepEqual(
      counted.filter(([, count]) => count !== 1),
      [],
    );
  });

  it('when a scope names the scope it narrows, then its files lie within that scope', () => {
    for (const [scope, { files, within }] of Object.entries(SCOPES)) {
      if (within) {
        const outer = matching(SCOPES[within].files);
        assert.deepEqual(
          [...matching(files)].filter((file) => !outer.has(file)),
          [],
          `${scope} within ${within}`,
        );
      }
    }
  });

  it('when the scopes are listed in another order, then every file is still checked as in its own scope', async () => {
    const reversed = Object.fromEntries(Object.entries(SCOPES).reverse());
    const eslint = new ESLint({
      cwd: frontend,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser },
          plugins: { '@typescript-eslint': tseslint.plugin },
        },
        ...confinedImports(reversed),
      ],
    });

    for (const entry of CONFINED_IMPORTS) {
      for (const scope of entry.allowedIn) {
        assert.deepEqual(
          await refusals(eslint, scope, dynamicImport(entry.examples[0])),
          [],
          `${entry.examples[0]} in ${scope}`,
        );
      }
    }
    assert.deepEqual(await refusals(eslint, 'routes', computedImport), [], 'computed in routes');
    assert.notDeepEqual(await refusals(eslint, 'app', computedImport), [], 'computed in app');
  });
});

describe('Given the import confinement table', () => {
  for (const entry of CONFINED_IMPORTS) {
    for (const module of entry.examples) {
      for (const scope of Object.keys(SCOPES)) {
        const allowed = entry.allowedIn.includes(scope);
        it(`when ${scope} imports ${module} statically, then it is ${allowed && !entry.lazyOnly ? 'allowed' : 'refused'}`, async () => {
          const found = await refusals(projectLint, scope, staticImport(module));

          assert.equal(found.length > 0, !allowed || !!entry.lazyOnly, JSON.stringify(found));
        });

        it(`when ${scope} imports ${module} with import(), then it is ${allowed ? 'allowed' : 'refused'}`, async () => {
          const found = await refusals(projectLint, scope, dynamicImport(module));

          assert.equal(found.length > 0, !allowed, JSON.stringify(found));
        });

        if (!allowed) {
          it(`when ${scope} imports ${module} with import() of a template literal, then it is refused`, async () => {
            assert.notDeepEqual(await refusals(projectLint, scope, templateImport(module)), []);
          });
        }
      }
    }
  }
});

describe('Given a module name computed at run time', () => {
  for (const scope of Object.keys(SCOPES)) {
    const allowed = scope === 'routes';
    it(`when ${scope} passes it to import(), then it is ${allowed ? 'allowed' : 'refused'}`, async () => {
      const found = await refusals(projectLint, scope, computedImport);

      assert.equal(found.length > 0, !allowed, JSON.stringify(found));
    });
  }
});

describe('Given a library that its adapter may load only lazily', () => {
  const lazy = {
    patterns: ['heavy-library', 'heavy-library/*'],
    dynamic: '^heavy-library(?:/.*)?$',
    allowedIn: ['routes'],
    lazyOnly: true,
    examples: ['heavy-library'],
    message: 'Load heavy-library in its adapter only.',
  };
  const eslint = new ESLint({
    cwd: frontend,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        plugins: { '@typescript-eslint': tseslint.plugin },
      },
      ...confinedImports(SCOPES, [lazy]),
    ],
  });

  it('when its adapter imports it statically, then it is refused', async () => {
    assert.notDeepEqual(await refusals(eslint, 'routes', staticImport('heavy-library')), []);
  });

  it('when its adapter imports only its types, then it is allowed', async () => {
    assert.deepEqual(await refusals(eslint, 'routes', typeImport('heavy-library')), []);
  });

  it('when its adapter loads it with import(), then it is allowed', async () => {
    assert.deepEqual(await refusals(eslint, 'routes', dynamicImport('heavy-library')), []);
  });

  it('when the app loads it with import(), then it is refused', async () => {
    assert.notDeepEqual(await refusals(eslint, 'app', dynamicImport('heavy-library')), []);
  });
});

describe('Given the libraries only tests may use', () => {
  const devOnly = CONFINED_IMPORTS.find((entry) => entry.examples.includes('vitest'));

  it('when the table is read, then it confines vitest, fast-check, fake-indexeddb, pdfjs-dist and Playwright to test support', () => {
    assert.ok(devOnly, 'an entry for the dev-only libraries');
    assert.deepEqual(
      [...devOnly.examples].sort(),
      [
        '@playwright/test',
        '@vitest/expect',
        'fake-indexeddb',
        'fake-indexeddb/auto',
        'fast-check',
        'pdfjs-dist',
        'pdfjs-dist/legacy/build/pdf.mjs',
        'vitest',
      ].sort(),
    );
    assert.deepEqual(devOnly.allowedIn, [
      'testSupport',
      'sharedCaseLoader',
      'sharedCaseSetup',
      'receiptAssetsSetup',
    ]);
  });
});

describe('Given the QR reader of the verification page', () => {
  const jsqr = CONFINED_IMPORTS.find((entry) => entry.examples.includes('jsqr'));
  const decoding = CONFINED_IMPORTS.find((entry) => entry.examples.includes('./qr-decoding'));

  it('when the table is read, then jsQR is imported only by the QR decoding and tests', () => {
    assert.ok(jsqr, 'an entry for jsqr');
    assert.deepEqual(jsqr.allowedIn, [
      'qrDecoding',
      'testSupport',
      'sharedCaseLoader',
      'sharedCaseSetup',
      'receiptAssetsSetup',
    ]);
  });

  it('when the table is read, then the QR decoding is loaded only by its worker and tests', () => {
    assert.ok(decoding, 'an entry for qr-decoding');
    assert.deepEqual(decoding.allowedIn, [
      'qrDecoderWorker',
      'testSupport',
      'sharedCaseLoader',
      'sharedCaseSetup',
      'receiptAssetsSetup',
    ]);
  });

  it('when the page code imports jsQR, then it is refused', async () => {
    assert.notDeepEqual(await refusals(projectLint, 'app', staticImport('jsqr')), []);
  });

  it('when the page code imports the QR decoding, then it is refused', async () => {
    assert.notDeepEqual(await refusals(projectLint, 'app', staticImport('./qr-decoding')), []);
  });

  for (const module of ['./qr-decoding.js', '../verification/qr-decoding.js']) {
    it(`when the page code imports the QR decoding as ${module}, with its extension, then it is refused`, async () => {
      assert.notDeepEqual(await refusals(projectLint, 'app', staticImport(module)), []);
      assert.notDeepEqual(await refusals(projectLint, 'app', dynamicImport(module)), []);
    });
  }
});

describe('Given the fallback Ed25519 library of the verification page', () => {
  const noble = CONFINED_IMPORTS.find((entry) => entry.examples.includes('@noble/curves'));

  it('when the table is read, then @noble/curves and its hashes load only lazily in their one adapter', () => {
    assert.ok(noble, 'an entry for @noble/curves');
    assert.deepEqual(noble.allowedIn, ['ed25519Fallback']);
    assert.equal(noble.lazyOnly, true);
    assert.deepEqual(SCOPES.ed25519Fallback.files, [
      'src/app/features/donations/verification/noble-ed25519.ts',
    ]);
  });
});

describe('Given pdfkit, which draws the receipts', () => {
  const pdfkit = CONFINED_IMPORTS.find((entry) => entry.examples.includes('pdfkit'));
  const layout = CONFINED_IMPORTS.find((entry) => entry.examples.includes('./receipt-layout'));

  it('when the table is read, then pdfkit and its font and line-break libraries load only in the receipt layout', () => {
    assert.ok(pdfkit, 'an entry for pdfkit');
    assert.deepEqual(pdfkit.allowedIn, ['receiptLayout']);
    assert.deepEqual(SCOPES.receiptLayout.files, [
      'src/app/features/donations/receipt-pdf/receipt-layout.ts',
    ]);
  });

  it("when the table is read, then pdfkit's own dependencies are confined with it, except the hashes the Ed25519 fallback also uses", () => {
    assert.deepEqual([...pdfkit.examples].sort(), [
      '@noble/ciphers',
      'fflate',
      'fontkit',
      'linebreak',
      'pdfkit',
      'pdfkit/js/pdfkit.standalone.js',
      'png-js',
    ]);
  });

  for (const module of ['./receipt-layout.js', '../receipt-pdf/receipt-layout.js']) {
    it(`when the app imports the receipt layout as ${module}, with its extension, then it is refused`, async () => {
      assert.notDeepEqual(await refusals(projectLint, 'app', staticImport(module)), []);
      assert.notDeepEqual(await refusals(projectLint, 'app', dynamicImport(module)), []);
    });
  }

  it('when the table is read, then only the receipt worker and tests load the receipt layout', () => {
    assert.ok(layout, 'an entry for the receipt layout');
    assert.deepEqual(layout.allowedIn, [
      'receiptWorker',
      'testSupport',
      'sharedCaseLoader',
      'sharedCaseSetup',
      'receiptAssetsSetup',
    ]);
    assert.deepEqual(SCOPES.receiptWorker.files, [
      'src/app/features/donations/receipt-pdf/receipt-pdf.worker.ts',
    ]);
  });
});
