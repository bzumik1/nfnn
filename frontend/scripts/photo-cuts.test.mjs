import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const themesDir = new URL('../src/themes/', import.meta.url);
const themes = readdirSync(themesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const focalPoint = readFileSync(
  new URL('../src/app/shared/ui/focal-point/focal-point.ts', import.meta.url),
  'utf8',
);
const storyTile = readFileSync(
  new URL('../src/app/features/content/projects-page/story-tile.scss', import.meta.url),
  'utf8',
);

const STORY_TILE_PHOTO = '--ratio-story-tile-photo';

function ratioOf(written) {
  const [width, height] = written.split('/').map((part) => Number(part.trim()));
  return height === undefined ? width : width / height;
}

function shapeRatio(source, shape) {
  const match = new RegExp(`${shape}: \\{ ratio: ([^,]+),`).exec(source);
  assert.ok(match, `focal-point.ts names the ratio of the shape ${shape}`);
  return ratioOf(match[1]);
}

function tokenRatio(source, token) {
  const match = new RegExp(`${token}:\\s*([^;]+);`).exec(source);
  return match === null ? null : ratioOf(match[1]);
}

function ruleBody(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `story-tile.scss has the rule ${selector}`);
  return source.slice(start, source.indexOf('}', start));
}

describe('Given the photo cut of a small story tile', () => {
  for (const theme of themes) {
    it(`when the theme ${theme} is read, then it cuts the photo as the administration's preview of a project card does`, () => {
      const source = readFileSync(new URL(`${theme}/_theme.scss`, themesDir), 'utf8');

      assert.equal(tokenRatio(source, STORY_TILE_PHOTO), shapeRatio(focalPoint, 'projectCard'));
    });
  }

  it('when the tile is styled, then its photo takes the cut from the theme', () => {
    assert.match(
      ruleBody(storyTile, '.tile-media'),
      new RegExp(`aspect-ratio: var\\(${STORY_TILE_PHOTO}\\);`),
    );
  });

  it('when a theme writes another cut, then the comparison notices it', () => {
    const other = `:root { ${STORY_TILE_PHOTO}: 4 / 3; }`;

    assert.notEqual(tokenRatio(other, STORY_TILE_PHOTO), shapeRatio(focalPoint, 'projectCard'));
  });
});
