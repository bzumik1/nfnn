import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

const styles = fileURLToPath(new URL('../src/styles', import.meta.url));
const keyframes = sass.compile(`${styles}/_motion-base.scss`).css;

function compiled(scss) {
  return sass.compileString(`@use 'motion';\n${scss}`, { loadPaths: [styles] }).css;
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function declarationsOf(css, selector) {
  return css.match(new RegExp(`(?:^|\\n)${escaped(selector)} \\{([^}]*)\\}`))?.[1] ?? '';
}

function animationOf(declarations) {
  return declarations.match(/animation:\s*([\w-]+)/)?.[1] ?? '';
}

function framesOf(name) {
  return (
    keyframes.match(new RegExp(`@keyframes ${escaped(name)} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
  );
}

describe('Given the appearance of the motion vocabulary', () => {
  it('when a line appears in place, then it fades by opacity alone through keyframes of its own', () => {
    const line = declarationsOf(
      compiled('.line { @include motion.appear($rises: false); }'),
      '.line',
    );

    const frames = framesOf(animationOf(line));
    assert.match(frames, /opacity/);
    assert.doesNotMatch(frames, /translate|transform|--motion-rise/);
  });

  it('when a line appears in place, then it sets no distance its children would inherit', () => {
    const css = compiled('.line { @include motion.appear($rises: false); }');

    assert.doesNotMatch(css, /--motion-rise\s*:/);
  });

  it('when a block appears inside content that appears in place, then the block keeps its rise', () => {
    const css = compiled(`
      .content {
        @include motion.appear($rises: false);

        .block {
          @include motion.appear;
        }
      }
    `);

    const frames = framesOf(animationOf(declarationsOf(css, '.content .block')));
    assert.match(frames, /translate: 0 var\(--motion-rise\)/);
    assert.doesNotMatch(css, /--motion-rise\s*:/);
  });
});
