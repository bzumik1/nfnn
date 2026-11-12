import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  STARTUP_SCREENS,
  decodePng,
  drawLaunchImage,
  encodePng,
  makeStartupImages,
  startupImages,
} from './make-startup-images.mjs';

const INDEX = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const THEME_LAUNCH_ICON = readFileSync(
  new URL('../src/themes/nova-nadeje/assets/launch-icon.svg', import.meta.url),
  'utf8',
);
const THEME_STYLES =
  ':root{--launch-icon-size: 128px;--color-surface: #ffffff}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--color-surface: #10141f}}@media(prefers-color-scheme:dark)and (prefers-contrast:more){:root{--color-surface: #000000}}';
const LIGHT = [255, 255, 255];
const DARK = [16, 20, 31];
const THEME_MANIFEST = JSON.parse(
  readFileSync(
    new URL('../src/themes/nova-nadeje/assets/manifest.webmanifest', import.meta.url),
    'utf8',
  ),
);

function linkedStartupImages() {
  const document = new JSDOM(INDEX).window.document;
  return [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map((link) => ({
    href: link.getAttribute('href'),
    media: link.getAttribute('media'),
  }));
}

function solid(width, height, rgb) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];
  }
  return { width, height, channels: 3, pixels };
}

function pixel(image, x, y) {
  const at = (y * image.width + x) * image.channels;
  return [...image.pixels.subarray(at, at + 3)];
}

function differentFrom(background, image, { left, top, right, bottom }) {
  let count = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if (pixel(image, x, y).some((value, channel) => value !== background[channel])) {
        count++;
      }
    }
  }
  return count;
}

function builtApp({ css = THEME_STYLES } = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'nfnn-startup-'));
  writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(THEME_MANIFEST));
  writeFileSync(join(dist, 'launch-icon.svg'), THEME_LAUNCH_ICON);
  writeFileSync(join(dist, 'styles-ABCDEFGH.css'), css);
  return dist;
}

describe('Given the iPhone and iPad screens the app has launch images for', () => {
  it('when index.html is read, then it links one startup image per screen, orientation and appearance with the media query of its exact size', () => {
    const expected = startupImages().map(({ href, media }) => ({ href, media }));

    assert.deepEqual(linkedStartupImages(), expected);
    assert.equal(expected.length, STARTUP_SCREENS.length * 4);
  });

  it('when the startup images are listed, then each file is named by its own pixel size, portrait and landscape, and the dark ones come after every light one', () => {
    const iphone = startupImages().filter(({ width, height }) => width * height === 1206 * 2622);

    assert.deepEqual(
      iphone.map(({ href, media }) => [href, media]),
      [
        [
          'startup/1206x2622.png',
          '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
        ],
        [
          'startup/2622x1206.png',
          '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)',
        ],
        [
          'startup/1206x2622-dark.png',
          '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)',
        ],
        [
          'startup/2622x1206-dark.png',
          '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape) and (prefers-color-scheme: dark)',
        ],
      ],
    );
    const appearances = startupImages().map(({ appearance }) => appearance);
    assert.equal(appearances.lastIndexOf('light') < appearances.indexOf('dark'), true);
  });

  it('when two screens are listed, then no two share a size and scale', () => {
    const keys = STARTUP_SCREENS.map(({ width, height, scale }) => `${width}x${height}@${scale}`);

    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('Given an icon and a background colour', () => {
  it('when a launch image is drawn, then the background fills the screen and the icon sits in its centre at the asked size', () => {
    const icon = solid(8, 8, [0, 93, 171]);

    const image = drawLaunchImage({
      icon,
      background: [255, 255, 255],
      width: 20,
      height: 30,
      iconSize: 4,
    });

    assert.equal(image.width, 20);
    assert.equal(image.height, 30);
    assert.deepEqual(pixel(image, 0, 0), [255, 255, 255]);
    assert.deepEqual(pixel(image, 19, 29), [255, 255, 255]);
    assert.deepEqual(pixel(image, 8, 13), [0, 93, 171]);
    assert.deepEqual(pixel(image, 11, 16), [0, 93, 171]);
    assert.deepEqual(pixel(image, 7, 13), [255, 255, 255]);
    assert.deepEqual(pixel(image, 12, 16), [255, 255, 255]);
  });

  it('when the icon is scaled down, then each pixel is the average of the icon area it covers', () => {
    const icon = solid(4, 4, [0, 0, 0]);
    icon.pixels.fill(255, 0, 4 * 2 * 3);

    const image = drawLaunchImage({
      icon,
      background: [10, 10, 10],
      width: 2,
      height: 2,
      iconSize: 2,
    });

    assert.deepEqual(pixel(image, 0, 0), [255, 255, 255]);
    assert.deepEqual(pixel(image, 1, 1), [0, 0, 0]);
  });

  it('when the icon has transparent pixels, then the background shows through them', () => {
    const icon = { width: 1, height: 1, channels: 4, pixels: Buffer.from([0, 0, 0, 0]) };

    const image = drawLaunchImage({
      icon,
      background: [200, 100, 50],
      width: 3,
      height: 3,
      iconSize: 1,
    });

    assert.deepEqual(pixel(image, 1, 1), [200, 100, 50]);
  });

  it('when a launch image is encoded and read back, then the pixels are unchanged', () => {
    const image = solid(5, 3, [1, 2, 3]);
    image.pixels[7] = 200;

    const read = decodePng(encodePng(image));

    assert.deepEqual(read, image);
  });

  it('when a PNG is not 8-bit RGB or RGBA, then reading it names what it is', () => {
    const grey = encodePng(solid(2, 2, [1, 2, 3]));
    grey[25] = 0;

    assert.throws(() => decodePng(grey), /colour type 0/);
  });
});

describe('Given a production build', () => {
  describe('when the startup images are made', () => {
    let dist;
    let made;

    before(() => {
      dist = builtApp();
      made = makeStartupImages(dist);
    });

    after(() => rmSync(dist, { recursive: true, force: true }));

    it('then every linked image exists in the build at its size', () => {
      assert.equal(made.length, STARTUP_SCREENS.length * 4);
      for (const { href, width, height } of startupImages()) {
        const image = decodePng(readFileSync(join(dist, href)));
        assert.equal(image.width, width, href);
        assert.equal(image.height, height, href);
      }
    });

    for (const [appearance, href, background] of [
      ['light', 'startup/1206x2622.png', LIGHT],
      ['dark', 'startup/1206x2622-dark.png', DARK],
    ]) {
      it(`then the ${appearance} image of an iPhone shows the star of the theme SVG at the theme size in the middle of the ${appearance} surface with no tile around it`, () => {
        const iphone = decodePng(readFileSync(join(dist, href)));
        const iconArea = { left: 411, top: 1119, right: 795, bottom: 1503 };
        assert.equal(
          differentFrom(background, iphone, { left: 0, top: 0, right: 1206, bottom: 2622 }),
          differentFrom(background, iphone, iconArea),
        );
        assert.ok(differentFrom(background, iphone, iconArea) > 1000);
        for (const [x, y] of [
          [411, 1119],
          [794, 1119],
          [411, 1502],
          [794, 1502],
        ]) {
          assert.deepEqual(pixel(iphone, x, y), background, `${x},${y}`);
        }
        assert.deepEqual(pixel(iphone, 603, 1299), [255, 255, 255]);
      });
    }
  });

  it('when its stylesheet sets no dark surface, then making the images fails and names the appearance', () => {
    const dist = builtApp({ css: ':root{--launch-icon-size: 128px;--color-surface: #ffffff}' });
    try {
      assert.throws(() => makeStartupImages(dist), /prefers-color-scheme: dark/);
      assert.equal(existsSync(join(dist, 'startup')), false);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('when its stylesheet sets no launch icon size, then making the images fails and names the token', () => {
    const dist = builtApp({ css: ':root{--color-surface:#fff}' });
    try {
      assert.throws(() => makeStartupImages(dist), /--launch-icon-size/);
      assert.equal(existsSync(join(dist, 'startup')), false);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('when the build holds no app, then nothing is made', () => {
    const dist = mkdtempSync(join(tmpdir(), 'nfnn-startup-'));
    mkdirSync(join(dist, 'empty'));
    try {
      assert.deepEqual(makeStartupImages(join(dist, 'empty')), []);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
