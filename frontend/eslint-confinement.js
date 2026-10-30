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

const SCOPES = {
  app: { files: ['src/**/*.ts'] },
  testSupport: { files: TEST_SUPPORT, within: 'app' },
  routes: { files: ['src/**/*.routes.ts'], within: 'app' },
  sharedCaseLoader: { files: [SHARED_CASE_LOADER], within: 'testSupport' },
  sharedCaseSetup: { files: [SHARED_CASE_SETUP], within: 'testSupport' },
};

function scopeGlobs(scopes = SCOPES) {
  return Object.fromEntries(
    Object.entries(scopes).map(([scope, { files }]) => [
      scope,
      {
        files,
        ignores:
          scope === 'app'
            ? TEST_SUPPORT
            : scope === 'testSupport'
              ? [SHARED_CASE_LOADER, SHARED_CASE_SETUP]
              : [],
      },
    ]),
  );
}

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
    allowedIn: ['testSupport', 'sharedCaseLoader', 'sharedCaseSetup'],
    examples: ['@angular/core/testing', '../testing/donations'],
    message:
      "Test support (a testing folder or a library's testing entry point) serves specs only; the app never imports it.",
  },
];

function confinedImports(scopes = SCOPES, table = CONFINED_IMPORTS) {
  return Object.entries(scopeGlobs(scopes)).map(([scope, { files, ignores }]) => {
    const refused = table.filter((entry) => !entry.allowedIn.includes(scope));
    return {
      files,
      ignores,
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: refused.flatMap(({ names = [], message }) =>
              names.map((name) => ({ name, message })),
            ),
            patterns: refused.flatMap(({ patterns = [], message }) =>
              patterns.length === 0 ? [] : [{ group: patterns, message }],
            ),
          },
        ],
        'no-restricted-syntax': [
          'error',
          ...refused.map(({ dynamic, message }) => ({
            selector: `ImportExpression[source.value=/${dynamic.replace(/\//g, '\\/')}/]`,
            message,
          })),
        ],
      },
    };
  });
}

module.exports = { SCOPES, CONFINED_IMPORTS, confinedImports, scopeGlobs };
