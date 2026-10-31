import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      pdfkit: fileURLToPath(new URL('node_modules/pdfkit/js/pdfkit.browser.mjs', import.meta.url)),
    },
  },
  test: {
    globalSetup: ['src/testing/shared-cases-setup.ts', 'src/testing/receipt-assets-setup.ts'],
  },
});
