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

  it('when the table is read, then it confines vitest, fast-check, fake-indexeddb, pdfjs-dist, jsQR and Playwright to test support', () => {
    assert.ok(devOnly, 'an entry for the dev-only libraries');
    assert.deepEqual(
      [...devOnly.examples].sort(),
      [
        '@playwright/test',
        '@vitest/expect',
        'fake-indexeddb',
        'fake-indexeddb/auto',
        'fast-check',
        'jsqr',
        'jsqr/dist/jsQR.js',
        'pdfjs-dist',
        'pdfjs-dist/legacy/build/pdf.mjs',
        'vitest',
      ].sort(),
    );
    assert.deepEqual(devOnly.allowedIn, ['testSupport', 'sharedCaseLoader', 'sharedCaseSetup']);
  });
});
