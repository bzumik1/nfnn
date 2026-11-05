import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BREAKPOINTS } from '../src/app/core/layout/breakpoints.ts';

const scss = readFileSync(new URL('../src/styles/_breakpoints.scss', import.meta.url), 'utf8');

function scssWidths(source) {
  const map = /\$widths:\s*\(([^)]*)\)/.exec(source);
  assert.ok(map, 'src/styles/_breakpoints.scss declares the map $widths');
  return Object.fromEntries(
    [...map[1].matchAll(/([a-z-]+):\s*(\d+)px/g)].map(([, name, width]) => [name, Number(width)]),
  );
}

describe('Given the breakpoints of the styles and of the app code', () => {
  it('when the SCSS map and the TypeScript constant are read, then they name the same widths', () => {
    assert.deepEqual({ ...BREAKPOINTS }, scssWidths(scss));
  });

  it('when a breakpoint is missing from one side, then the comparison notices it', () => {
    const shorter = scss.replace(/\s*nav: \d+px,/, '');

    assert.notDeepEqual({ ...BREAKPOINTS }, scssWidths(shorter));
  });
});
