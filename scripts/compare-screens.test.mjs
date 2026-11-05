import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  acceptedStates,
  compareImages,
  cropAround,
  declaredAppearance,
  diffImage,
  ELEMENT_TOLERANCE_PIXELS,
  encodePng,
  onlyPublic,
  options,
  outsideRepository,
  PAGE_TOLERANCE_RATIO,
  pairShots,
  publicRoute,
  readRoutes,
  reportMarkdown,
  shotKind,
  shotState,
  staleAcceptances,
  undeclaredShots,
  useHeadPlaywright,
  withinTolerance,
} from './compare-screens.mjs';
import { decodePng } from './png-pixels.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const WHITE = [255, 255, 255, 255];
const RED = [200, 0, 0, 255];

function image(width, height, paint = () => WHITE) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgba.set(paint(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

function pixel({ width, rgba }, x, y) {
  return [...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
}

describe('Given two screenshots of a state', () => {
  it('when they hold the same pixels, then no pixel differs and there is no box', () => {
    const comparison = compareImages(image(4, 3), image(4, 3));

    assert.deepEqual(comparison, {
      sameSize: true,
      differingPixels: 0,
      totalPixels: 12,
      box: null,
    });
  });

  it('when two pixels differ, then it counts them and boxes them', () => {
    const changed = image(10, 8, (x, y) =>
      (x === 2 && y === 1) || (x === 6 && y === 5) ? RED : WHITE,
    );

    const comparison = compareImages(image(10, 8), changed);

    assert.equal(comparison.differingPixels, 2);
    assert.deepEqual(comparison.box, { x: 2, y: 1, width: 5, height: 5 });
  });

  it('when one is taller, then the rows only one has differ and the sizes are reported as changed', () => {
    const comparison = compareImages(image(4, 3), image(4, 5));

    assert.equal(comparison.sameSize, false);
    assert.equal(comparison.differingPixels, 8);
    assert.equal(comparison.totalPixels, 20);
    assert.deepEqual(comparison.box, { x: 0, y: 3, width: 4, height: 2 });
  });
});

describe('Given the tolerance of the screens manifest', () => {
  it('when a shot is named state-width, then it is a page and a name with a double hyphen is an element', () => {
    assert.equal(shotKind('home-1280.png'), 'page');
    assert.equal(shotKind('home-donate-1000--qr-390.png'), 'element');
  });

  it('when a page differs in at most 0.2 % of its pixels, then it passes, and above that it fails', () => {
    assert.equal(
      withinTolerance('home-390.png', { sameSize: true, differingPixels: 2, totalPixels: 1000 }),
      true,
    );
    assert.equal(
      withinTolerance('home-390.png', { sameSize: true, differingPixels: 3, totalPixels: 1000 }),
      false,
    );
  });

  it('when an element differs in one pixel, then it fails', () => {
    assert.equal(
      withinTolerance('home--donate-qr-390.png', {
        sameSize: true,
        differingPixels: 1,
        totalPixels: 100_000,
      }),
      false,
    );
  });

  it('when a shot changed its size, then it fails whatever the count', () => {
    assert.equal(
      withinTolerance('home-390.png', { sameSize: false, differingPixels: 0, totalPixels: 1000 }),
      false,
    );
  });

  it('when the screens spec is read, then it compares with the same tolerances as the script', () => {
    const spec = readFileSync(join(root, 'frontend/e2e/baseline/screens.spec.ts'), 'utf8');

    assert.match(spec, new RegExp(`maxDiffPixelRatio: ${PAGE_TOLERANCE_RATIO}\\b`));
    assert.match(spec, new RegExp(`maxDiffPixels: ${ELEMENT_TOLERANCE_PIXELS}\\b`));
  });
});

describe('Given the shots of the merge base and of the head', () => {
  it('when they are paired, then it lists the shots of both, the added and the removed ones', () => {
    assert.deepEqual(pairShots(['a-390.png', 'b-390.png'], ['b-390.png', 'c-390.png']), {
      both: ['b-390.png'],
      added: ['c-390.png'],
      removed: ['a-390.png'],
    });
  });
});

describe('Given a differing state', () => {
  it('when its PNG is written and read back, then it holds the same pixels', () => {
    const original = image(3, 2, (x, y) => (x === y ? RED : WHITE));

    assert.deepEqual(decodePng(encodePng(original)), original);
  });

  it('when it is cropped around the difference, then the crop keeps the margin inside the image', () => {
    const shot = image(100, 80, (x, y) => (x === 50 && y === 40 ? RED : WHITE));

    const crop = cropAround(shot, { x: 50, y: 40, width: 1, height: 1 }, 10);

    assert.equal(crop.width, 21);
    assert.equal(crop.height, 21);
    assert.deepEqual(pixel(crop, 10, 10), RED);
    assert.deepEqual(cropAround(shot, { x: 0, y: 0, width: 2, height: 2 }, 10).width, 12);
  });

  it('when the diff is drawn, then differing pixels are red and the rest is the base faded', () => {
    const base = image(2, 1, () => [0, 0, 0, 255]);
    const head = image(2, 1, (x) => (x === 1 ? [0, 0, 255, 255] : [0, 0, 0, 255]));

    const diff = diffImage(base, head);

    assert.deepEqual(pixel(diff, 1, 0), [255, 0, 0, 255]);
    assert.notDeepEqual(pixel(diff, 0, 0), [255, 0, 0, 255]);
  });

  it('when the report is written, then it names each differing state with its count and crops, the added and the removed shots', () => {
    const markdown = reportMarkdown({
      base: 'abc1234',
      head: 'def5678',
      results: [
        {
          file: 'home-390.png',
          comparison: { sameSize: true, differingPixels: 0, totalPixels: 100, box: null },
          passes: true,
        },
        {
          file: 'home--donate-qr-390.png',
          comparison: {
            sameSize: true,
            differingPixels: 7,
            totalPixels: 100,
            box: { x: 1, y: 2, width: 3, height: 4 },
          },
          passes: false,
          crops: [
            'crops/home--donate-qr-390-base.png',
            'crops/home--donate-qr-390-head.png',
            'crops/home--donate-qr-390-diff.png',
          ],
        },
      ],
      added: ['new-390.png'],
      removed: ['old-390.png'],
      failedRuns: [],
    });

    assert.match(markdown, /abc1234/);
    assert.match(markdown, /home--donate-qr-390\.png/);
    assert.match(markdown, /\| 7 \|/);
    assert.match(markdown, /crops\/home--donate-qr-390-diff\.png/);
    assert.match(markdown, /new-390\.png/);
    assert.match(markdown, /old-390\.png/);
    assert.doesNotMatch(markdown, /\| home-390\.png \|/);
  });
});

describe('Given where the report is written', () => {
  it('when the folder is inside the repository, then it is refused, and a scratch folder is accepted', () => {
    assert.equal(outsideRepository(join(root, 'frontend/test-results'), root), false);
    assert.equal(outsideRepository(root, root), false);
    assert.equal(outsideRepository(join(tmpdir(), 'nfnn-screens'), root), true);
  });
});

describe('Given the options of the script', () => {
  it('when every option is known and the value options carry =value, then it returns them', () => {
    assert.deepEqual(
      options([
        '--base=abc1234',
        '--out=/tmp/x=y',
        '--patch=regression/v2/additions/0.6c.patch',
        '--declared=/tmp/body.md',
        '--accepted=regression/public-screens-since-v2.json',
        '--v2-only',
        '--public-only',
        '--base-only',
        '--keep',
      ]),
      {
        base: 'abc1234',
        out: '/tmp/x=y',
        patch: 'regression/v2/additions/0.6c.patch',
        declared: '/tmp/body.md',
        accepted: 'regression/public-screens-since-v2.json',
        'v2-only': true,
        'public-only': true,
        'base-only': true,
        keep: true,
      },
    );
  });

  it('when an option is unknown, then it is refused by name', () => {
    assert.throws(() => options(['--head-specs']), /unknown option --head-specs/);
  });

  it('when a value option is given without =value, as with a space, then it is refused', () => {
    assert.throws(
      () => options(['--patch', 'regression/v2/additions/0.6c.patch']),
      /--patch needs a value: --patch=<file>/,
    );
  });

  it('when a switch is given a value, then it is refused', () => {
    assert.throws(() => options(['--keep=no']), /--keep takes no value/);
  });

  it('when an argument is no option, then it is refused', () => {
    assert.throws(() => options(['main']), /unexpected argument main/);
  });

  it('when the head spec and a patch are both asked for, then it is refused', () => {
    assert.throws(
      () => options(['--head-spec', '--patch=regression/v2/additions/0.6c.patch']),
      /--head-spec and --patch both change the spec of the base; give one/,
    );
  });
});

describe('Given the description of a pull request', () => {
  it('when it says the look stays, then nothing is declared', () => {
    assert.deepEqual(declaredAppearance('Goal\n\nVzhled: beze změny\nRoadmapa: beze změny\n'), {
      kind: 'unchanged',
      items: [],
    });
    assert.deepEqual(declaredAppearance('  vzhled:   beze zmeny  '), { kind: 'unchanged', items: [] });
  });

  it('when it names what changes, then it declares those routes and states', () => {
    assert.deepEqual(
      declaredAppearance('Vzhled se mění: /sprava/platby, /darce/*,  sign-in-dialog\nRoadmapa: beze změny'),
      { kind: 'changes', items: ['/sprava/platby', '/darce/*', 'sign-in-dialog'] },
    );
    assert.deepEqual(declaredAppearance('vzhled se meni: /'), { kind: 'changes', items: ['/'] });
  });

  it('when it names one element shot of a state, then it declares that shot', () => {
    assert.deepEqual(declaredAppearance('Vzhled se mění: sign-in-recovery-payment--details, home--donate-qr'), {
      kind: 'changes',
      items: ['sign-in-recovery-payment--details', 'home--donate-qr'],
    });
    assert.throws(() => declaredAppearance('Vzhled se mění: home---donate'), /"home---donate" is neither a route/);
    assert.throws(() => declaredAppearance('Vzhled se mění: home--'), /"home--" is neither a route/);
  });

  it('when it says nothing about the look, then the declaration is missing and nothing may change', () => {
    assert.deepEqual(declaredAppearance('Roadmapa: beze změny'), { kind: 'missing', items: [] });
    assert.deepEqual(declaredAppearance(''), { kind: 'missing', items: [] });
  });

  it('when a declared item is neither a route nor a state, then it is refused by name', () => {
    assert.throws(() => declaredAppearance('Vzhled se mění: platby a dárci'), /"platby a dárci" is neither a route/);
    assert.throws(() => declaredAppearance('Vzhled se mění: '), /names no route or state/);
  });

  it('when the description was written in the web form with CRLF line ends, then every line still counts', () => {
    assert.deepEqual(declaredAppearance('Vzhled se mění: /sprava/platby\r'), { kind: 'changes', items: ['/sprava/platby'] });
    assert.deepEqual(declaredAppearance('Vzhled se mění: /sprava/platby\r\nVzhled se mění: sign-in-dialog\r'), {
      kind: 'changes',
      items: ['/sprava/platby', 'sign-in-dialog'],
    });
    assert.deepEqual(declaredAppearance('Vzhled: beze změny\r'), { kind: 'unchanged', items: [] });
  });

  it('when it both keeps and changes the look, then it is refused', () => {
    assert.throws(
      () => declaredAppearance('Vzhled: beze změny\nVzhled se mění: /'),
      /both "Vzhled: beze změny" and "Vzhled se mění: …"/,
    );
  });
});

describe('Given shots with the routes they were taken at', () => {
  const routes = new Map([
    ['home-390', '/'],
    ['home--donate-qr-390', '/'],
    ['admin-payments-1280', '/sprava/platby'],
    ['donor-overview-390', '/darce/prehled'],
    ['sign-in-dialog-390', '/'],
  ]);
  const differing = (file) => ({ file, passes: false });

  it('when a shot is named, then its state is the name before the width and before an element part', () => {
    assert.equal(shotState('home--donate-qr-390.png'), 'home');
    assert.equal(shotState('admin-payments-error-1280.png'), 'admin-payments-error');
  });

  it('when the declaration names a route, a route with a star or a state, then those shots are declared and the rest are not', () => {
    const results = ['home-390.png', 'home--donate-qr-390.png', 'admin-payments-1280.png', 'donor-overview-390.png', 'sign-in-dialog-390.png']
      .map(differing)
      .concat([{ file: 'news-390.png', passes: true }]);
    assert.deepEqual(
      undeclaredShots({ results, removed: [] }, routes, ['/sprava/platby', '/darce/*', 'sign-in-dialog']),
      [
        { file: 'home--donate-qr-390.png', route: '/' },
        { file: 'home-390.png', route: '/' },
      ],
    );
    assert.deepEqual(undeclaredShots({ results, removed: [] }, routes, ['/', '/sprava/*', 'donor-overview']), []);
  });

  it('when the declaration names an element shot, then only that shot is declared, at every width', () => {
    const results = ['home-390.png', 'home--donate-qr-390.png', 'home--donate-qr-1280.png'].map(differing);
    assert.deepEqual(undeclaredShots({ results, removed: [] }, routes, ['home--donate-qr']), [
      { file: 'home-390.png', route: '/' },
    ]);
  });

  it('when a shot was removed, then only its state declares it, since the head took no route for it', () => {
    assert.deepEqual(undeclaredShots({ results: [], removed: ['old-state-390.png'] }, routes, ['/']), [
      { file: 'old-state-390.png', route: null },
    ]);
    assert.deepEqual(undeclaredShots({ results: [], removed: ['old-state-390.png'] }, routes, ['old-state']), []);
  });

  it('when the accepted differences name a state whose shot was removed, then the removal is still undeclared', () => {
    const compared = { results: [differing('home-390.png')], removed: ['news-390.png'] };
    assert.deepEqual(undeclaredShots(compared, routes, ['home', 'news'], []), [{ file: 'news-390.png', route: null }]);
    assert.deepEqual(undeclaredShots(compared, routes, ['home', 'news'], ['news']), []);
  });

  it('when a differing shot has no recorded route, then only its state declares it', () => {
    assert.deepEqual(undeclaredShots({ results: [differing('lost-390.png')], removed: [] }, routes, ['/*']), [
      { file: 'lost-390.png', route: null },
    ]);
  });

  it('when a route is asked whether it is public, then the donor area and the administration are not', () => {
    assert.equal(publicRoute('/'), true);
    assert.equal(publicRoute('/aktuality/clanek'), true);
    assert.equal(publicRoute('/darce/prehled'), false);
    assert.equal(publicRoute('/sprava'), false);
    assert.equal(publicRoute('/spravce'), true);
  });

  it('when the report is written with a declaration, then it shows each route, whether it is declared and the line that would declare the rest', () => {
    const markdown = reportMarkdown({
      base: 'abc1234',
      head: 'def5678',
      results: [
        { file: 'home-390.png', comparison: { differingPixels: 900, totalPixels: 100000, sameSize: true, box: { x: 0, y: 0, width: 30, height: 30 } }, passes: false },
        { file: 'admin-payments-1280.png', comparison: { differingPixels: 900, totalPixels: 100000, sameSize: true, box: { x: 0, y: 0, width: 30, height: 30 } }, passes: false },
      ],
      added: [],
      removed: [],
      failedRuns: [],
      routes,
      declaration: { kind: 'changes', items: ['/sprava/platby'] },
      undeclared: [{ file: 'home-390.png', route: '/' }],
    });
    assert.match(markdown, /\| home-390\.png \| \/ \| page \| 900 \|.*\| ne \|/);
    assert.match(markdown, /\| admin-payments-1280\.png \| \/sprava\/platby \| page \| 900 \|.*\| ano \|/);
    assert.match(markdown, /Vzhled se mění: \/sprava\/platby, \//);
  });
});

describe('Given the routes the two runs recorded', () => {
  it('when they are read, then each shot has the route of the head, and of the base only where the head took none', () => {
    const head = mkdtempSync(join(tmpdir(), 'nfnn-routes-head-'));
    const base = mkdtempSync(join(tmpdir(), 'nfnn-routes-base-'));
    writeFileSync(join(head, 'home-390.route'), '/\n');
    writeFileSync(join(base, 'home-390.route'), '/stara\n');
    writeFileSync(join(base, 'old-state-390.route'), '/odebrana\n');
    writeFileSync(join(head, 'home-390.png'), '');
    assert.deepEqual(
      [...readRoutes(head, base, join(tmpdir(), 'nfnn-routes-missing'))].sort(),
      [
        ['home-390', '/'],
        ['old-state-390', '/odebrana'],
      ],
    );
  });

  it('when only the public pages are compared, then shots of the donor area and the administration drop out and a shot without a route stays', () => {
    const routes = new Map([
      ['home-390', '/'],
      ['admin-home-390', '/sprava'],
      ['donor-overview-390', '/darce/prehled'],
    ]);
    const kept = onlyPublic(
      {
        results: ['home-390.png', 'admin-home-390.png', 'unknown-390.png'].map((file) => ({ file, passes: false })),
        added: ['donor-overview-390.png'],
        removed: ['home-390.png'],
      },
      routes,
    );
    assert.deepEqual(kept.results.map((result) => result.file), ['home-390.png', 'unknown-390.png']);
    assert.deepEqual(kept.added, []);
    assert.deepEqual(kept.removed, ['home-390.png']);
  });
});

describe('Given the accepted differences of the public pages since v2', () => {
  it('when they are read, then each names its state with the change it came with and why', () => {
    assert.deepEqual(
      acceptedStates(JSON.stringify({ shots: [{ state: 'home', since: '#205', reason: 'the hero names the foundation' }] })),
      ['home'],
    );
  });

  it('when an entry lacks its state, its change or its reason, then it is refused', () => {
    assert.throws(() => acceptedStates('{}'), /no list "shots"/);
    assert.throws(() => acceptedStates(JSON.stringify({ shots: [{ state: 'Home page', since: '#1', reason: 'x' }] })), /names no state/);
    assert.throws(() => acceptedStates(JSON.stringify({ shots: [{ state: 'home', reason: 'x' }] })), /needs its reason and the change/);
    assert.throws(() => acceptedStates(JSON.stringify({ shots: [{ state: 'home', since: '#1', reason: ' ' }] })), /needs its reason/);
  });

  it('when the file in the repository is read, then every entry is valid', () => {
    assert.ok(acceptedStates(readFileSync(join(root, 'regression/public-screens-since-v2.json'), 'utf8')).length >= 0);
  });
});

describe('Given accepted states and the shots that differ', () => {
  it('when an accepted state differs in no shot any more, then it is named as stale', () => {
    assert.deepEqual(
      staleAcceptances(['home', 'news', 'project'], {
        results: [
          { file: 'home--donate-qr-390.png', passes: false },
          { file: 'news-390.png', passes: true },
        ],
        removed: ['project-1280.png'],
      }),
      ['news'],
    );
  });

  it('when the report names stale accepted states, then it asks to remove them', () => {
    const markdown = reportMarkdown({
      base: 'abc1234',
      head: 'def5678',
      results: [],
      added: [],
      removed: [],
      failedRuns: [],
      stale: ['news'],
    });
    assert.match(markdown, /už neliší.*\n\n- news/s);
  });
});

describe('Given a base checkout whose lock file installed another Playwright than the head', () => {
  it('when the base is prepared, then it shoots with the head\'s Playwright, so the head\'s installed browser serves both sides', () => {
    const folder = mkdtempSync(join(tmpdir(), 'nfnn-playwright-'));
    const headModules = join(folder, 'head/node_modules');
    const baseModules = join(folder, 'base/node_modules');
    for (const [modules, version] of [[headModules, '1.65.0'], [baseModules, '1.64.1']]) {
      for (const name of ['@playwright/test', 'playwright', 'playwright-core', '@angular/core']) {
        mkdirSync(join(modules, name), { recursive: true });
        writeFileSync(join(modules, name, 'package.json'), JSON.stringify({ name, version }));
      }
    }
    useHeadPlaywright(headModules, baseModules);
    const version = (name) => JSON.parse(readFileSync(join(baseModules, name, 'package.json'), 'utf8')).version;
    assert.equal(version('@playwright/test'), '1.65.0');
    assert.equal(version('playwright'), '1.65.0');
    assert.equal(version('playwright-core'), '1.65.0');
    assert.equal(realpathSync(join(baseModules, 'playwright-core')), realpathSync(join(headModules, 'playwright-core')));
    assert.equal(version('@angular/core'), '1.64.1');
  });
});
