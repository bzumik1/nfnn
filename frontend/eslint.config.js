// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');
const { confinedImports } = require('./eslint-confinement');

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
    files: ['src/**/*.ts'],
    ignores: [
      'src/app/features/donations/payment-details-api.ts',
      'src/app/features/donations/verification/receipt-keys-api.ts',
      'src/app/features/donations/verification/receipt-status-api.ts',
      'src/**/*.spec.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/auth-interceptor'],
              importNames: ['WITHOUT_ACCESS_TOKEN'],
              message:
                'Only the API service of a public endpoint (payment-details-api.ts, receipt-keys-api.ts, receipt-status-api.ts) sends its request without the access token; an endpoint that needs the token answers 401 without it (frontend.md, HTTP and data).',
            },
          ],
        },
      ],
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
