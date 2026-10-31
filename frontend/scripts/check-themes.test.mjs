import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receiptTokensOutsideRoot } from './check-themes.mjs';

describe('Given the receipt tokens of a theme', () => {
  it('when every receipt token sits in the top-level :root block, then nothing is reported', () => {
    const theme = `
      @font-face { font-family: 'Inter'; src: url('inter.woff2'); }
      :root {
        --color-text: #222222;
        --receipt-color-text: #1a1a1a;
        --receipt-font-body: 'body.0123456789abcdef.ttf';
      }
      @media (prefers-contrast: more) {
        :root { --color-text: #000000; }
      }
    `;

    assert.deepEqual(receiptTokensOutsideRoot(theme), []);
  });

  it('when a receipt token is set again under a media query, then that token is reported, because the receipt bytes would depend on the device', () => {
    const theme = `
      :root { --receipt-color-text: #1a1a1a; }
      @media (prefers-contrast: more) {
        :root {
          --color-text: #000000;
          --receipt-color-text: #000000;
        }
      }
    `;

    assert.deepEqual(receiptTokensOutsideRoot(theme), ['--receipt-color-text']);
  });

  it('when a receipt token is set under forced colours, on another selector or nested in :root, then each is reported', () => {
    const theme = `
      :root {
        --receipt-color-muted: #555555;
        .dark { --receipt-color-code: #333333; }
      }
      @media (forced-colors: active) { :root { --receipt-color-english: #222222; } }
      html { --receipt-font-heading: 'heading.0123456789abcdef.ttf'; }
    `;

    assert.deepEqual(receiptTokensOutsideRoot(theme), [
      '--receipt-color-code',
      '--receipt-color-english',
      '--receipt-font-heading',
    ]);
  });

  it('when a receipt token is only named in a comment, then nothing is reported', () => {
    const theme = `
      // --receipt-color-text: #000000; under @media would be refused
      /* @media print { :root { --receipt-color-text: #000000; } } */
      :root { --receipt-color-text: #1a1a1a; }
    `;

    assert.deepEqual(receiptTokensOutsideRoot(theme), []);
  });
});
