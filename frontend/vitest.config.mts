import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['src/testing/shared-cases-setup.ts'],
  },
});
