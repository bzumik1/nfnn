import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BREAKPOINTS, HEIGHTS } from '../src/app/core/layout/breakpoints.ts';

const scss = readFileSync(new URL('../src/styles/_breakpoints.scss', import.meta.url), 'utf8');

function scssMap(source, name) {
  const map = new RegExp(`\\$${name}:\\s*\\(([^)]*)\\)`).exec(source);
  assert.ok(map, `src/styles/_breakpoints.scss declares the map $${name}`);
  return Object.fromEntries(
    [...map[1].matchAll(/([a-z-]+):\s*(\d+)px/g)].map(([, key, size]) => [key, Number(size)]),
  );
}

function scssWidths(source) {
  return scssMap(source, 'widths');
}

describe('Given the breakpoints of the styles and of the app code', () => {
  it('when the SCSS map and the TypeScript constant are read, then they name the same widths', () => {
    assert.deepEqual({ ...BREAKPOINTS }, scssWidths(scss));
  });

  it('when a breakpoint is missing from one side, then the comparison notices it', () => {
    const shorter = scss.replace(/\s*nav: \d+px,/, '');

    assert.notDeepEqual({ ...BREAKPOINTS }, scssWidths(shorter));
  });

  it('when the SCSS map of heights and the TypeScript constant are read, then they name the same heights', () => {
    assert.deepEqual({ ...HEIGHTS }, scssMap(scss, 'heights'));
  });

  it('when a height is missing from one side, then the comparison notices it', () => {
    const shorter = scss.replace(/\s*short: \d+px,/, '');

    assert.notDeepEqual({ ...HEIGHTS }, scssMap(shorter, 'heights'));
  });
});
