import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { rasterizeSvg } from './svg-raster.mjs';

function svg(body, viewBox = '0 0 10 10') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><title>Test</title>${body}</svg>`;
}

function rgba(image, x, y) {
  const at = (y * image.width + x) * 4;
  return [...image.pixels.subarray(at, at + 4)];
}

const THEMES = ['nova-nadeje', 'control'];

describe('Given an SVG made of filled paths', () => {
  it('when a square is drawn on whole pixels, then the pixels inside take its colour and the rest stay transparent', () => {
    const image = rasterizeSvg(svg('<path fill="#005dab" d="M2 2L6 2L6 6L2 6Z"/>'), {
      width: 10,
      height: 10,
    });

    assert.deepEqual(rgba(image, 2, 2), [0, 93, 171, 255]);
    assert.deepEqual(rgba(image, 5, 5), [0, 93, 171, 255]);
    assert.deepEqual(rgba(image, 1, 2), [0, 0, 0, 0]);
    assert.deepEqual(rgba(image, 6, 5), [0, 0, 0, 0]);
  });

  it('when an edge runs through the middle of a pixel, then that pixel is half covered', () => {
    const image = rasterizeSvg(svg('<path fill="#ffffff" d="M2.5 0L10 0L10 10L2.5 10Z"/>'), {
      width: 10,
      height: 10,
    });

    assert.deepEqual(rgba(image, 2, 4), [255, 255, 255, 128]);
    assert.deepEqual(rgba(image, 3, 4), [255, 255, 255, 255]);
  });

  it('when the viewBox is larger than the image, then the drawing is scaled into it', () => {
    const image = rasterizeSvg(
      svg('<path fill="#fff" d="M0 0L50 0L50 100L0 100Z"/>', '0 0 100 100'),
      {
        width: 10,
        height: 10,
      },
    );

    assert.deepEqual(rgba(image, 4, 9), [255, 255, 255, 255]);
    assert.deepEqual(rgba(image, 5, 0), [0, 0, 0, 0]);
  });

  it('when a group carries a matrix, then its paths are moved and scaled by it', () => {
    const image = rasterizeSvg(
      svg('<g transform="matrix(2 0 0 2 4 4)"><path fill="#fff" d="M0 0L1 0L1 1L0 1Z"/></g>'),
      { width: 10, height: 10 },
    );

    assert.deepEqual(rgba(image, 4, 4), [255, 255, 255, 255]);
    assert.deepEqual(rgba(image, 5, 5), [255, 255, 255, 255]);
    assert.deepEqual(rgba(image, 6, 6), [0, 0, 0, 0]);
    assert.deepEqual(rgba(image, 3, 3), [0, 0, 0, 0]);
  });

  it('when a path holds a second ring inside the first, then evenodd leaves a hole and nonzero fills it', () => {
    const rings = 'M1 1L9 1L9 9L1 9ZM3 3L7 3L7 7L3 7Z';

    const evenodd = rasterizeSvg(svg(`<path fill="#fff" fill-rule="evenodd" d="${rings}"/>`), {
      width: 10,
      height: 10,
    });
    const nonzero = rasterizeSvg(svg(`<path fill="#fff" d="${rings}"/>`), {
      width: 10,
      height: 10,
    });

    assert.deepEqual(rgba(evenodd, 5, 5), [0, 0, 0, 0]);
    assert.deepEqual(rgba(evenodd, 2, 5), [255, 255, 255, 255]);
    assert.deepEqual(rgba(nonzero, 5, 5), [255, 255, 255, 255]);
  });

  it('when a curve bounds the shape, then the pixels follow the curve', () => {
    const circle =
      'M5 0C7.761 0 10 2.239 10 5C10 7.761 7.761 10 5 10C2.239 10 0 7.761 0 5C0 2.239 2.239 0 5 0Z';

    const image = rasterizeSvg(svg(`<path fill="#fff" d="${circle}"/>`), {
      width: 100,
      height: 100,
    });

    assert.equal(rgba(image, 50, 50)[3], 255);
    assert.equal(rgba(image, 2, 2)[3], 0);
    assert.equal(rgba(image, 97, 97)[3], 0);
    let covered = 0;
    for (let at = 3; at < image.pixels.length; at += 4) {
      covered += image.pixels[at] / 255;
    }
    assert.ok(Math.abs(covered - Math.PI * 50 * 50) < 20, `${covered}`);
  });

  it('when a later path covers an earlier one, then the later colour is on top', () => {
    const image = rasterizeSvg(
      svg(
        '<path fill="#fff" d="M0 0L10 0L10 10L0 10Z"/><path fill="#005dab" d="M4 4L6 4L6 6L4 6Z"/>',
      ),
      { width: 10, height: 10 },
    );

    assert.deepEqual(rgba(image, 4, 4), [0, 93, 171, 255]);
    assert.deepEqual(rgba(image, 0, 0), [255, 255, 255, 255]);
  });
});

describe('Given an SVG with something a filled path cannot draw', () => {
  for (const [what, body] of [
    ['a stroke', '<path fill="#fff" stroke="#000" d="M0 0L1 0L1 1Z"/>'],
    ['a rect', '<rect width="10" height="10" fill="#fff"/>'],
    ['a style', '<path style="fill:red" d="M0 0L1 0L1 1Z"/>'],
    ['a relative command', '<path fill="#fff" d="M0 0l1 0l0 1z"/>'],
    [
      'a transform other than a matrix',
      '<g transform="scale(2)"><path fill="#fff" d="M0 0L1 0L1 1Z"/></g>',
    ],
    ['a named colour', '<path fill="red" d="M0 0L1 0L1 1Z"/>'],
  ]) {
    it(`when it holds ${what}, then drawing it fails and names what`, () => {
      assert.throws(() => rasterizeSvg(svg(body), { width: 4, height: 4 }), /not supported/);
    });
  }
});

describe('Given the launch icon of each theme', () => {
  for (const theme of THEMES) {
    it(`when ${theme}'s is drawn at the size of a launch image, then the star stands on a transparent ground without a tile`, () => {
      const text = readFileSync(
        new URL(`../src/themes/${theme}/assets/launch-icon.svg`, import.meta.url),
        'utf8',
      );

      const image = rasterizeSvg(text, { width: 384, height: 384 });

      for (const [x, y] of [
        [0, 0],
        [383, 0],
        [0, 383],
        [383, 383],
        [192, 8],
      ]) {
        assert.equal(rgba(image, x, y)[3], 0, `${x},${y}`);
      }
      assert.deepEqual(rgba(image, 192, 180), [255, 255, 255, 255]);
      let blue = 0;
      for (let at = 0; at < image.pixels.length; at += 4) {
        if (image.pixels[at + 3] === 255 && image.pixels[at + 2] === 171) {
          blue++;
        }
      }
      assert.ok(blue > 2000, `${blue}`);
    });
  }
});
