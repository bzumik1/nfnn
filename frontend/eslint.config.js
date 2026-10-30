// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');
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
  app: { files: ['src/**/*.ts'], ignores: TEST_SUPPORT },
  testSupport: { files: TEST_SUPPORT, ignores: [SHARED_CASE_LOADER, SHARED_CASE_SETUP] },
  sharedCaseLoader: { files: [SHARED_CASE_LOADER], ignores: [] },
  sharedCaseSetup: { files: [SHARED_CASE_SETUP], ignores: [] },
};

const CONFINED_IMPORTS = [
  {
    patterns: ['ajv', 'ajv/*'],
    dynamic: '^ajv(?:/.*)?$',
    allowedIn: ['sharedCaseLoader'],
    message: 'Read and validate shared cases through src/testing/shared-cases.ts.',
  },
  {
    names: NODE_BUILTINS,
    dynamic: `^(?:${NODE_BUILTINS.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
    allowedIn: ['sharedCaseSetup'],
    message:
      'Only the Vitest global setup src/testing/shared-cases-setup.ts runs in Node; specs get the shared cases from it and the app never imports Node.',
  },
  {
    patterns: ['**/testing', '**/testing/**'],
    dynamic: '(?:^|/)testing(?:/|$)',
    allowedIn: ['testSupport', 'sharedCaseLoader', 'sharedCaseSetup'],
    message:
      "Test support (a testing folder or a library's testing entry point) serves specs only; the app never imports it.",
  },
];

function confinedImports() {
  return Object.entries(SCOPES).map(([scope, { files, ignores }]) => {
    const refused = CONFINED_IMPORTS.filter((entry) => !entry.allowedIn.includes(scope));
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

module.exports = defineConfig([
  {
    files: ['**/*.ts', '**/*.mts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      prettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
    },
  },
  ...confinedImports(),
  {
    files: ['e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test', 'expect'],
              message:
                "Import test and expect from './fixtures', which answers every unmocked /api request.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*dialog*.html'],
    rules: {
      '@angular-eslint/template/no-autofocus': 'off',
    },
  },
  {
    files: ['**/shared/ui/dialog/dialog.html'],
    rules: {
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
    },
  },
]);
