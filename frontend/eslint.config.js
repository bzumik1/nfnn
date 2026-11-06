// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');
const { confinedImports } = require('./eslint-confinement');

const DEVICE_CRYPTO_STORES_NOTHING =
  'The device crypto core keeps everything in memory and stores nothing ("Cizí počítač"); its caller stores the sealed records and wraps (frontend.md, Device copies).';

const NO_FIXED_WAIT = {
  selector: ":matches(Identifier[name='waitForTimeout'], Literal[value='waitForTimeout'])",
  message:
    'waitForTimeout is a fixed wait: wait on observable state (expect, expect.poll, toPass, e2e/settled.ts); only a test that proves nothing happens waits a fixed time, through waitWhileNothingMayHappen of e2e/fixed-waits.ts (testing.md, Frontend e2e).',
};

module.exports = defineConfig([
  {
    linterOptions: { noInlineConfig: true },
  },
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
      'src/app/core/connectivity/connectivity-probe-api.ts',
      'src/app/features/donations/payment-details-api.ts',
      'src/app/features/donations/verification/receipt-keys-api.ts',
      'src/app/features/donations/verification/receipt-status-api.ts',
      'src/app/features/operations/setup/setup-api.ts',
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
                'Only the API service of a public endpoint (payment-details-api.ts, receipt-keys-api.ts, receipt-status-api.ts, setup-api.ts for the setup status, connectivity-probe-api.ts for the connectivity probe of the same setup status) sends its request without the access token; an endpoint that needs the token answers 401 without it (frontend.md, HTTP and data).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/core/device/crypto/**/*.ts'],
    ignores: ['src/app/core/device/crypto/**/*.spec.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['indexedDB', 'localStorage', 'sessionStorage', 'caches', 'cookieStore'].map((name) => ({
          name,
          message: DEVICE_CRYPTO_STORES_NOTHING,
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'self', 'globalThis'].flatMap((object) =>
          [
            'indexedDB',
            'localStorage',
            'sessionStorage',
            'caches',
            'cookieStore',
            'document',
            'navigator',
          ].map((property) => ({
            object,
            property,
            message: DEVICE_CRYPTO_STORES_NOTHING,
          })),
        ),
        { object: 'document', property: 'cookie', message: DEVICE_CRYPTO_STORES_NOTHING },
        { object: 'navigator', property: 'storage', message: DEVICE_CRYPTO_STORES_NOTHING },
        { object: 'navigator', property: 'credentials', message: DEVICE_CRYPTO_STORES_NOTHING },
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
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/fixed-waits.ts'],
    rules: {
      'no-restricted-syntax': ['error', NO_FIXED_WAIT],
    },
  },
  {
    files: ['e2e/pwa/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test', 'expect'],
              message:
                "Import pwaTest and expect from './pwa-fixtures', which routes /api for the whole context, so the service worker's requests are answered too.",
            },
            {
              name: '../fixtures',
              importNames: ['test', 'expect'],
              message:
                "Import pwaTest and expect from './pwa-fixtures': the fixtures of the other projects route only the page, which misses the service worker's requests.",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        NO_FIXED_WAIT,
        {
          selector:
            "CallExpression[callee.object.name='page'][callee.property.name=/^(route|unroute|routeFromHAR)$/]",
          message:
            'Route on the context (context.route): a page route never sees the requests of a service worker, so once a worker controls the page the mock stops answering.',
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
