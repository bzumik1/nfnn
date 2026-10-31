import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import type { ReceiptAssetLibrary } from './receipt-assets';

const THEMES = fileURLToPath(new URL('../themes/', import.meta.url));
const V2_RECEIPTS = fileURLToPath(new URL('../../../regression/v2/receipts/', import.meta.url));
const LOGO = fileURLToPath(new URL('../../public/images/logo.svg', import.meta.url));
const SAMPLE = /^(?:single|yearly)-.+\.json$/;

export default function provideReceiptAssets(project: TestProject): void {
  const library: ReceiptAssetLibrary = {
    fonts: Object.fromEntries(
      readdirSync(THEMES).map((theme) => [
        theme,
        Object.fromEntries(
          readdirSync(join(THEMES, theme, 'receipt'))
            .filter((file) => file.endsWith('.ttf'))
            .map((file) => [
              file,
              readFileSync(join(THEMES, theme, 'receipt', file)).toString('base64'),
            ]),
        ),
      ]),
    ),
    v2Receipts: Object.fromEntries(
      readdirSync(V2_RECEIPTS)
        .filter((file) => SAMPLE.test(file))
        .sort()
        .map((file) => [
          file.replace(/\.json$/, ''),
          JSON.parse(readFileSync(join(V2_RECEIPTS, file), 'utf8')),
        ]),
    ),
    logoSvg: readFileSync(LOGO, 'utf8'),
  };
  project.provide('receiptAssets', library);
}
