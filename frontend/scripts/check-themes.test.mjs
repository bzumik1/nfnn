import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  barContrastProblems,
  receiptTokensOutsideRoot,
  themeAssetProblems,
} from './check-themes.mjs';

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

const BARS = `
  :root {
    --color-tab-bar: color-mix(in srgb, #0f172a 66%, transparent);
    --color-tab-pill: color-mix(in srgb, #0f172a 88%, transparent);
    --color-tab-active: #93c5fd;
    --color-on-tab-bar: #ffffff;
    --color-tab-focus-ring: #ffffff;
  }
`;

describe('Given the colours of the tab bar over the page', () => {
  it('when white labels sit on the navy glass and the active label on its pill, then nothing is reported', () => {
    assert.deepEqual(barContrastProblems('nova-nadeje', BARS), []);
  });

  it('when the glass of the tab bar is too light for white labels over a white page, then the contrast is reported', () => {
    const light = BARS.replace(
      'color-mix(in srgb, #0f172a 66%, transparent)',
      'color-mix(in srgb, #6b7080 90%, transparent)',
    );

    assert.deepEqual(barContrastProblems('grey', light), [
      'theme grey: --color-on-tab-bar on --color-tab-bar over a white page is 4.03:1, below 4.5:1',
    ]);
  });

  it('when the active label is the page blue on the pill, then the contrast is reported', () => {
    const blue = BARS.replace('--color-tab-active: #93c5fd;', '--color-tab-active: #2563eb;');

    assert.match(
      barContrastProblems('blue', blue).join('\n'),
      /--color-tab-active on --color-tab-pill over --color-tab-bar over a white page is [0-9.]+:1, below 4.5:1/,
    );
  });

  it('when a media query makes the bar solid, then the colours of that block are checked too', () => {
    const solid = `${BARS}
      @media (prefers-reduced-transparency: reduce) {
        :root { --color-tab-bar: #9ca3af; }
      }
    `;

    assert.match(
      barContrastProblems('solid', solid).join('\n'),
      /under @media \(prefers-reduced-transparency: reduce\): --color-on-tab-bar on --color-tab-bar/,
    );
  });

  it('when a bar colour is not a literal colour or a mix of one with transparent, then it is reported, because its contrast cannot be checked', () => {
    const indirect = BARS.replace(
      '--color-tab-active: #93c5fd;',
      '--color-tab-active: var(--color-accent-on-inverse);',
    );

    assert.deepEqual(barContrastProblems('indirect', indirect), [
      'theme indirect sets --color-tab-active to var(--color-accent-on-inverse), not a literal #rrggbb',
    ]);
  });

  it('when a bar colour is missing, then it is reported', () => {
    const missing = BARS.replace('--color-tab-focus-ring: #ffffff;', '');

    assert.deepEqual(barContrastProblems('missing', missing), [
      'theme missing does not set --color-tab-focus-ring in its top-level :root',
    ]);
  });
});

const ANGULAR = {
  projects: {
    frontend: {
      architect: {
        build: {
          options: {
            assets: [
              { glob: '**/*', input: 'public' },
              { glob: '**/*', input: 'src/themes/nova-nadeje/assets', output: '/' },
            ],
          },
          configurations: {
            'control-theme': {
              assets: [
                { glob: '**/*', input: 'public' },
                { glob: '**/*', input: 'src/themes/control/assets', output: '/' },
              ],
            },
          },
        },
      },
    },
  },
};

const LOGO_AND_ICONS = ['favicon.svg', 'images/logo.svg'];

describe('Given the files each theme serves', () => {
  it('when every theme carries the same files, none of them is also in public/ and each build serves its own theme, then nothing is reported', () => {
    assert.deepEqual(
      themeAssetProblems({
        reference: 'nova-nadeje',
        assets: new Map([
          ['nova-nadeje', LOGO_AND_ICONS],
          ['control', LOGO_AND_ICONS],
        ]),
        publicFiles: ['images/hero-1024.webp', 'robots.txt'],
        angular: ANGULAR,
      }),
      [],
    );
  });

  it('when a theme lacks a file the reference theme has, or has one more, then both are reported', () => {
    assert.deepEqual(
      themeAssetProblems({
        reference: 'nova-nadeje',
        assets: new Map([
          ['nova-nadeje', LOGO_AND_ICONS],
          ['control', ['favicon.svg', 'images/logo-control.svg']],
        ]),
        publicFiles: [],
        angular: ANGULAR,
      }),
      [
        'theme control has no assets/images/logo.svg, which nova-nadeje serves',
        'theme control serves assets/images/logo-control.svg, which nova-nadeje does not',
      ],
    );
  });

  it('when a theme file is also in public/, then it is reported, because the build would serve one of them unseen', () => {
    assert.deepEqual(
      themeAssetProblems({
        reference: 'nova-nadeje',
        assets: new Map([['nova-nadeje', LOGO_AND_ICONS]]),
        publicFiles: ['images/logo.svg'],
        angular: ANGULAR,
      }),
      [
        'public/images/logo.svg is served at the same address as the theme file assets/images/logo.svg',
      ],
    );
  });

  it('when a build configuration serves the files of another theme, then it is reported', () => {
    const swapped = structuredClone(ANGULAR);
    swapped.projects.frontend.architect.build.configurations['control-theme'].assets[1].input =
      'src/themes/nova-nadeje/assets';

    assert.deepEqual(
      themeAssetProblems({
        reference: 'nova-nadeje',
        assets: new Map([
          ['nova-nadeje', LOGO_AND_ICONS],
          ['control', LOGO_AND_ICONS],
        ]),
        publicFiles: [],
        angular: swapped,
      }),
      [
        'the build configuration control-theme does not serve src/themes/control/assets at the site root',
        'the build configuration control-theme serves src/themes/nova-nadeje/assets, the files of another theme',
      ],
    );
  });
});
