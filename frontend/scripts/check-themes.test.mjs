import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  appearanceProblems,
  barContrastProblems,
  launchIconProblems,
  manifestProblems,
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

  it('when the white glass carries black labels, then the contrast over a black page is reported too, because dark content scrolls under the bar', () => {
    const white = BARS.replace(
      'color-mix(in srgb, #0f172a 66%, transparent)',
      'color-mix(in srgb, #ffffff 40%, transparent)',
    ).replace('--color-on-tab-bar: #ffffff;', '--color-on-tab-bar: #000000;');

    assert.match(
      barContrastProblems('white', white).join('\n'),
      /theme white: --color-on-tab-bar on --color-tab-bar over a black page is 3\.66:1, below 4\.5:1/,
    );
  });

  it('when the focus ring is as dark as the pill it surrounds, then the contrast against the pill is reported', () => {
    const ring = BARS.replace(
      '--color-tab-focus-ring: #ffffff;',
      '--color-tab-focus-ring: #1e293b;',
    );

    assert.match(
      barContrastProblems('ring', ring).join('\n'),
      /--color-tab-focus-ring on --color-tab-pill over --color-tab-bar over a white page/,
    );
  });

  it('when a colour is written in upper case, then it is read like the lower-case one', () => {
    assert.deepEqual(barContrastProblems('upper', BARS.replace('#93c5fd', '#93C5FD')), []);
  });

  it('when an address in the theme holds a double slash, then the tokens after it are still read', () => {
    const font = `@font-face { src: url('https://example.org/x.woff2'); }\n${BARS}`;

    assert.deepEqual(barContrastProblems('font', font), []);
  });

  it('when a bar colour is set under a rule the check does not follow, then it is reported, because its contrast would go unchecked', () => {
    const hidden = `${BARS}
      @supports (backdrop-filter: blur(1px)) {
        :root { --color-tab-bar: #9ca3af; }
      }
      :root:not([data-x]) { --color-tab-pill: #9ca3af; }
    `;

    assert.deepEqual(barContrastProblems('hidden', hidden), [
      'theme hidden sets --color-tab-bar under @supports (backdrop-filter: blur(1px)) > :root, where its contrast is not checked; set it in the top-level :root or a @media block of :root',
      'theme hidden sets --color-tab-pill under :root:not([data-x]), where its contrast is not checked; set it in the top-level :root or a @media block of :root',
    ]);
  });

  it('when the bar is solid and its pill hardly differs from it, then the pill is reported, because the active tab would show by its label colour alone', () => {
    const solid = `${BARS}
      @media (prefers-reduced-transparency: reduce) {
        :root { --color-tab-bar: #0f172a; --color-tab-pill: #060d1f; }
      }
    `;

    assert.deepEqual(barContrastProblems('solid', solid), [
      'theme solid under @media (prefers-reduced-transparency: reduce): solid --color-tab-pill on --color-tab-bar is 1.08:1, below 3:1',
    ]);
  });
});

function themeSource(name) {
  return readFileSync(new URL(`../src/themes/${name}/_theme.scss`, import.meta.url), 'utf8');
}

const NOVA_NADEJE = themeSource('nova-nadeje');

describe('Given the colours a theme sets for the light and the dark appearance', () => {
  it('when the themes of the site are checked, then every text, control and focus ring stays readable in each appearance', () => {
    assert.deepEqual(appearanceProblems('nova-nadeje', NOVA_NADEJE), []);
    assert.deepEqual(appearanceProblems('control', themeSource('control')), []);
  });

  it('when a theme sets no colours for the dark appearance, then it is reported, because the site would stay light on a dark device', () => {
    const lightOnly = NOVA_NADEJE.replaceAll(
      '(prefers-color-scheme: dark)',
      '(prefers-color-scheme: light)',
    );

    assert.deepEqual(appearanceProblems('light-only', lightOnly), [
      'theme light-only sets no colours under @media (prefers-color-scheme: dark), so it ignores the dark appearance of the device',
    ]);
  });

  it('when the dark text is hardly lighter than the dark page, then its contrast in the dark appearance is reported', () => {
    const dim = NOVA_NADEJE.replace('    --color-text: #e6e8ee;', '    --color-text: #3a4050;');

    assert.match(
      appearanceProblems('dim', dim).join('\n'),
      /^theme dim in the dark appearance: --color-text on --color-surface is [0-9.]+:1, below 4.5:1$/m,
    );
  });

  it('when the block for more contrast comes after the dark block, then its dark text is reported over the dark page, because a later block wins in the dark too', () => {
    const contrastStart = NOVA_NADEJE.indexOf('@media (prefers-contrast: more)');
    const contrastBlock = NOVA_NADEJE.slice(
      contrastStart,
      NOVA_NADEJE.indexOf('@media (prefers-reduced-transparency', contrastStart),
    );
    const darkContrastStart = NOVA_NADEJE.indexOf(
      '@media (prefers-color-scheme: dark) and (prefers-contrast: more)',
    );
    const darkContrastEnd = NOVA_NADEJE.indexOf('@media (inverted-colors: inverted)');
    const reordered = `${NOVA_NADEJE.slice(0, darkContrastStart)}${NOVA_NADEJE.slice(darkContrastEnd)}\n${contrastBlock}`;

    assert.match(
      appearanceProblems('reordered', reordered).join('\n'),
      /^theme reordered in the dark appearance with more contrast: --color-text-secondary on --color-surface is [0-9.]+:1, below 4.5:1$/m,
    );
    assert.deepEqual(
      appearanceProblems('reordered', reordered).filter((problem) =>
        problem.includes('in the light'),
      ),
      [],
    );
  });

  it('when a ground is a translucent mix, then it is laid over the page before the text on it is measured', () => {
    const translucent = NOVA_NADEJE.replace(
      '    --color-accent-soft: #162a4d;',
      '    --color-accent-soft: color-mix(in srgb, #e6e8ee 90%, transparent);',
    );

    assert.match(
      appearanceProblems('translucent', translucent).join('\n'),
      /^theme translucent in the dark appearance: --color-text on --color-accent-soft is [0-9.]+:1, below 4.5:1$/m,
    );
  });

  it('when a colour names another token, then the colour of that token is measured', () => {
    const named = NOVA_NADEJE.replace(
      '    --color-focus-ring: #6ea8ff;',
      '    --color-focus-ring: var(--color-surface-alt);',
    );

    assert.match(
      appearanceProblems('named', named).join('\n'),
      /^theme named in the dark appearance: --color-focus-ring on --color-surface is [0-9.]+:1, below 3:1$/m,
    );
  });

  it('when a checked colour is neither a literal colour, a mix of one with transparent nor another token, then it is reported, because its contrast cannot be measured', () => {
    const computed = NOVA_NADEJE.replace(
      '    --color-text: #e6e8ee;',
      '    --color-text: light-dark(#1a1a2e, #e6e8ee);',
    );

    assert.ok(
      appearanceProblems('computed', computed).includes(
        'theme computed in the dark appearance: --color-text is light-dark(#1a1a2e, #e6e8ee), not a colour whose contrast can be measured',
      ),
    );
  });

  it('when the light accent is too light for the grouped page of the app areas, then its contrast there is reported', () => {
    const pale = NOVA_NADEJE.replace('  --color-accent: #1d5fc9;', '  --color-accent: #4f86e8;');

    assert.match(
      appearanceProblems('pale', pale).join('\n'),
      /^theme pale in the light appearance: --color-accent on --color-surface-grouped is [0-9.]+:1, below 4.5:1$/m,
    );
  });

  it('when the accent is too light for its own 14 % tint, then its contrast on the tint is reported, because tinted buttons and the selected pill carry accent text', () => {
    const pale = NOVA_NADEJE.replace('  --color-accent: #1d5fc9;', '  --color-accent: #3b74e0;');

    assert.match(
      appearanceProblems('pale', pale).join('\n'),
      /^theme pale in the light appearance: --color-accent on the 14 % tint of --color-accent is [0-9.]+:1, below 4.5:1$/m,
    );
  });

  it('when the soft text is too light for a sheet in the dark, then its contrast on the elevated surface is reported', () => {
    const dim = NOVA_NADEJE.replace(
      '    --color-text-soft: #9aa3b2;',
      '    --color-text-soft: #5d6575;',
    );

    assert.match(
      appearanceProblems('dim', dim).join('\n'),
      /^theme dim in the dark appearance: --color-text-soft on --color-surface-elevated is [0-9.]+:1, below 4.5:1$/m,
    );
  });

  it('when the text of the filled warning badge is too light for it, then its contrast is reported', () => {
    const pale = NOVA_NADEJE.replace(
      '  --color-badge-warning: #b45309;',
      '  --color-badge-warning: #f59e0b;',
    );

    assert.match(
      appearanceProblems('pale', pale).join('\n'),
      /^theme pale in the light appearance: --color-on-badge-warning on --color-badge-warning is [0-9.]+:1, below 4.5:1$/m,
    );
  });

  it('when an icon tile is too light for its white glyph, then its contrast is reported against the 3:1 of a graphic', () => {
    const pale = NOVA_NADEJE.replace(
      '  --color-tile-warning: #d97706;',
      '  --color-tile-warning: #fbbf24;',
    );

    assert.match(
      appearanceProblems('pale', pale).join('\n'),
      /^theme pale in the light appearance: --color-on-tile on --color-tile-warning is [0-9.]+:1, below 3:1$/m,
    );
  });

  it('when the field border is as soft in the dark as in the default look, then only the dark appearance reports it, because Jakub kept the soft border of the light default', () => {
    const soft = NOVA_NADEJE.replace(
      '    --color-border-field: #6b7588;',
      '    --color-border-field: #2a3243;',
    );

    const problems = appearanceProblems('soft', soft);

    assert.deepEqual(
      problems.filter((problem) => problem.includes('--color-border-field')),
      [
        'theme soft in the dark appearance: --color-border-field on --color-surface is 1.38:1, below 3:1',
        'theme soft in the dark appearance: --color-border-field on --color-surface-alt is 1.53:1, below 3:1',
      ],
    );
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

const THEME_COLOURS = `
  :root {
    --color-accent: #2563eb;
    --color-surface: #ffffff;
  }
  @media (prefers-contrast: more) {
    :root { --color-accent: #1d4ed8; }
  }
`;

const MANIFEST = {
  id: '/aplikace',
  name: 'Nová naděje – nadační fond',
  short_name: 'Nová naděje',
  lang: 'cs',
  start_url: '/aplikace',
  scope: '/',
  display: 'standalone',
  theme_color: '#2563eb',
  background_color: '#ffffff',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const ICON_SIZES = new Map([
  ['icon-192.png', [192, 192]],
  ['icon-512.png', [512, 512]],
  ['icon-maskable-512.png', [512, 512]],
]);

describe('Given the web app manifest of a theme', () => {
  const problemsOf = (
    manifest,
    iconSizes = ICON_SIZES,
    source = THEME_COLOURS,
    homeScreenTitle = 'Nová naděje',
  ) => manifestProblems({ theme: 'control', manifest, source, iconSizes, homeScreenTitle });

  it('when it opens /aplikace standalone in Czech with the theme colours and icons it carries, then nothing is reported', () => {
    assert.deepEqual(problemsOf(MANIFEST), []);
  });

  it('when it is missing, then it is reported', () => {
    assert.deepEqual(problemsOf(null), ['theme control has no assets/manifest.webmanifest']);
  });

  it('when it starts elsewhere, opens in a browser tab or names another language, then each is reported', () => {
    assert.deepEqual(
      problemsOf({
        ...MANIFEST,
        id: '/',
        start_url: '/darce',
        scope: '/darce/',
        display: 'browser',
        lang: 'en',
      }),
      [
        'theme control: manifest id is /, not /aplikace',
        'theme control: manifest start_url is /darce, not /aplikace',
        'theme control: manifest scope is /darce/, not /',
        'theme control: manifest display is browser, not standalone',
        'theme control: manifest lang is en, not cs',
      ],
    );
  });

  it('when its colours differ from the accent and surface the theme sets in its top-level :root, then both are reported', () => {
    assert.deepEqual(
      problemsOf({ ...MANIFEST, theme_color: '#1d4ed8', background_color: '#000000' }),
      [
        'theme control: manifest theme_color #1d4ed8 is not --color-accent #2563eb',
        'theme control: manifest background_color #000000 is not --color-surface #ffffff',
      ],
    );
  });

  it('when an icon is missing from the theme, has other pixels than it says or the set lacks a size or a maskable icon, then each is reported', () => {
    const icons = [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-gone.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
    ];
    const sizes = new Map([
      ['icon-192.png', [192, 192]],
      ['icon-512.png', [500, 500]],
    ]);

    assert.deepEqual(problemsOf({ ...MANIFEST, icons }, sizes), [
      'theme control: manifest icon /icon-512.png is 500x500, not 512x512',
      'theme control: manifest icon /icon-gone.png is not a PNG in assets/',
      'theme control: manifest has no maskable icon of 512x512',
    ]);
  });

  it('when its short name is longer than the twelve characters an iPhone shows under the icon, then it is reported', () => {
    const name = 'Nová naděje – nadační fond';
    assert.deepEqual(
      problemsOf({ ...MANIFEST, short_name: name }, ICON_SIZES, THEME_COLOURS, name),
      [
        'theme control: manifest short_name Nová naděje – nadační fond is longer than 12 characters',
      ],
    );
  });

  it('when the page names the app for the home screen otherwise than its short name or not at all, then it is reported', () => {
    assert.deepEqual(problemsOf(MANIFEST, ICON_SIZES, THEME_COLOURS, 'NFNN'), [
      'theme control: manifest short_name Nová naděje is not the apple-mobile-web-app-title NFNN of src/index.html',
    ]);
    assert.deepEqual(problemsOf(MANIFEST, ICON_SIZES, THEME_COLOURS, null), [
      'theme control: manifest short_name Nová naděje is not the apple-mobile-web-app-title null of src/index.html',
    ]);
  });
});

describe('Given the launch icon of a theme', () => {
  const star =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Star</title><path fill="#005dab" d="M5 1L9 9L1 9Z"/></svg>';

  it('when it is filled paths with transparent corners, then nothing is reported', () => {
    assert.deepEqual(launchIconProblems({ theme: 'control', svg: star }), []);
  });

  it('when the theme has none, then the missing file is reported', () => {
    assert.deepEqual(launchIconProblems({ theme: 'control', svg: null }), [
      'theme control has no assets/launch-icon.svg, which the launch screen and the launch images draw',
    ]);
  });

  it('when it holds what the launch images cannot draw, then that is reported', () => {
    const stroked = star.replace('<path fill', '<path stroke="#000" fill');

    const problems = launchIconProblems({ theme: 'control', svg: stroked });

    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^theme control: assets\/launch-icon\.svg cannot be drawn into the launch images: .*stroke/,
    );
  });

  it('when it paints a tile behind the star, then the tile is reported, because it would stand out on the dark surface', () => {
    const tiled = star.replace(
      '<path fill',
      '<path fill="#ffffff" d="M0 0L10 0L10 10L0 10Z"/><path fill',
    );

    assert.deepEqual(launchIconProblems({ theme: 'control', svg: tiled }), [
      'theme control: assets/launch-icon.svg paints its corners, so a tile would stand around the star on the dark launch screen',
    ]);
  });
});
