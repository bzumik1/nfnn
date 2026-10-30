import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compareImages,
  cropAround,
  diffImage,
  ELEMENT_TOLERANCE_PIXELS,
  encodePng,
  options,
  outsideRepository,
  PAGE_TOLERANCE_RATIO,
  pairShots,
  reportMarkdown,
  shotKind,
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
        '--v2-only',
        '--base-only',
        '--keep',
      ]),
      {
        base: 'abc1234',
        out: '/tmp/x=y',
        patch: 'regression/v2/additions/0.6c.patch',
        'v2-only': true,
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
