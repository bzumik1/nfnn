// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');

const SHARED_CASE_VALIDATOR_ONLY = {
  group: ['ajv', 'ajv/*'],
  message: 'Read and validate shared cases through src/testing/shared-cases.ts.',
};
const VITEST_GLOBAL_SETUP_ONLY = {
  group: ['node:*'],
  message:
    'Only the Vitest global setup src/testing/shared-cases-setup.ts reads files in Node; specs get the shared cases from it and the app never imports Node.',
};

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
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
  {
    files: ['src/**/*.ts'],
    ignores: ['src/testing/shared-cases.ts', 'src/testing/shared-cases-setup.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [SHARED_CASE_VALIDATOR_ONLY, VITEST_GLOBAL_SETUP_ONLY] },
      ],
    },
  },
  {
    files: ['src/testing/shared-cases.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [VITEST_GLOBAL_SETUP_ONLY] }],
    },
  },
  {
    files: ['src/testing/shared-cases-setup.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SHARED_CASE_VALIDATOR_ONLY] }],
    },
  },
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
