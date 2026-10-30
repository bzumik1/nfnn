// @ts-check
const { builtinModules } = require('node:module');

const NODE_BUILTINS = [
  ...new Set(
    builtinModules.flatMap((name) => (name.startsWith('node:') ? [name] : [name, `node:${name}`])),
  ),
];
const TEST_SUPPORT = [
  'src/**/*.spec.ts',
  'src/**/testing/**',
  'src/test-setup.ts',
  'src/test-providers.ts',
];
const SHARED_CASE_LOADER = 'src/testing/shared-cases.ts';
const SHARED_CASE_SETUP = 'src/testing/shared-cases-setup.ts';
const COMPUTED_IMPORTS_ALLOWED_IN = ['routes'];

const SCOPES = {
  app: { files: ['src/**/*.ts'] },
  testSupport: { files: TEST_SUPPORT, within: 'app' },
  routes: { files: ['src/**/*.routes.ts'], within: 'app' },
  sharedCaseLoader: { files: [SHARED_CASE_LOADER], within: 'testSupport' },
  sharedCaseSetup: { files: [SHARED_CASE_SETUP], within: 'testSupport' },
};

const TEST_SCOPES = ['testSupport', 'sharedCaseLoader', 'sharedCaseSetup'];

const CONFINED_IMPORTS = [
  {
    patterns: ['ajv', 'ajv/*'],
    dynamic: '^ajv(?:/.*)?$',
    allowedIn: ['sharedCaseLoader'],
    examples: ['ajv', 'ajv/dist/2020'],
    message: 'Read and validate shared cases through src/testing/shared-cases.ts.',
  },
  {
    names: NODE_BUILTINS,
    dynamic: `^(?:${NODE_BUILTINS.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
    allowedIn: ['sharedCaseSetup'],
    examples: ['node:fs', 'path'],
    message:
      'Only the Vitest global setup src/testing/shared-cases-setup.ts runs in Node; specs get the shared cases from it and the app never imports Node.',
  },
  {
    patterns: ['**/testing', '**/testing/**'],
    dynamic: '(?:^|/)testing(?:/|$)',
    allowedIn: TEST_SCOPES,
    examples: ['@angular/core/testing', '../testing/donations'],
    message:
      "Test support (a testing folder or a library's testing entry point) serves specs only; the app never imports it.",
  },
  {
    patterns: [
      'vitest',
      'vitest/*',
      '@vitest/*',
      'fast-check',
      'fast-check/*',
      'fake-indexeddb',
      'fake-indexeddb/*',
      'pdfjs-dist',
      'pdfjs-dist/*',
      '@playwright/test',
      '@playwright/test/*',
    ],
    dynamic:
      '^(?:vitest|@vitest/[^/]+|fast-check|fake-indexeddb|pdfjs-dist|@playwright/test)(?:/.*)?$',
    allowedIn: TEST_SCOPES,
    examples: [
      'vitest',
      '@vitest/expect',
      'fast-check',
      'fake-indexeddb',
      'fake-indexeddb/auto',
      'pdfjs-dist',
      'pdfjs-dist/legacy/build/pdf.mjs',
      '@playwright/test',
    ],
    message:
      'A development library (Vitest, fast-check, fake-indexeddb, pdf.js, Playwright) serves the tests only; the app never ships it.',
  },
];

function narrower(scopes, scope) {
  return Object.values(scopes)
    .filter(({ within }) => within === scope)
    .flatMap(({ files }) => files);
}

function scopeGlobs(scopes = SCOPES) {
  return Object.fromEntries(
    Object.entries(scopes).map(([scope, { files }]) => [
      scope,
      { files, ignores: narrower(scopes, scope) },
    ]),
  );
}

function escapedForSelector(pattern) {
  return pattern.replace(/\//g, '\\/');
}

function staticRefusals(entries, allowTypeImports) {
  return {
    paths: entries.flatMap(({ names = [], message }) =>
      names.map((name) => ({ name, message, allowTypeImports })),
    ),
    patterns: entries.flatMap(({ patterns = [], message }) =>
      patterns.length === 0 ? [] : [{ group: patterns, message, allowTypeImports }],
    ),
  };
}

function mergedRefusals(...parts) {
  return {
    paths: parts.flatMap(({ paths }) => paths),
    patterns: parts.flatMap(({ patterns }) => patterns),
  };
}

function confinedImports(scopes = SCOPES, table = CONFINED_IMPORTS) {
  return Object.entries(scopeGlobs(scopes)).map(([scope, { files, ignores }]) => {
    const refused = table.filter((entry) => !entry.allowedIn.includes(scope));
    const lazyHere = table
      .filter((entry) => entry.lazyOnly && entry.allowedIn.includes(scope))
      .map((entry) => ({
        ...entry,
        message: `${entry.message} Load it with import() only, so it stays out of the bundle that loads first.`,
      }));
    const computedImports = COMPUTED_IMPORTS_ALLOWED_IN.includes(scope)
      ? []
      : [
          {
            selector: "ImportExpression:not([source.type='Literal'])",
            message:
              'Name the module of import() as a plain string, so the confinement table in eslint-confinement.js can check it; only route files compute one.',
          },
        ];
    return {
      files,
      ignores,
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          mergedRefusals(staticRefusals(refused, false), staticRefusals(lazyHere, true)),
        ],
        'no-restricted-syntax': [
          'error',
          ...refused.flatMap(({ dynamic, message }) => [
            {
              selector: `ImportExpression[source.value=/${escapedForSelector(dynamic)}/]`,
              message,
            },
            {
              selector: `ImportExpression[source.quasis.0.value.cooked=/${escapedForSelector(dynamic.replace(/\$$/, ''))}/]`,
              message,
            },
          ]),
          ...computedImports,
        ],
      },
    };
  });
}

module.exports = { SCOPES, CONFINED_IMPORTS, confinedImports, scopeGlobs };
