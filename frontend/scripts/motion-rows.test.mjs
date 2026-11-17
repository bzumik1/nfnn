import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

const styles = fileURLToPath(new URL('../src/styles', import.meta.url));
const keyframes = sass.compile(`${styles}/_motion-base.scss`).css;
const MOVING = /\b(transform|translate|scale|rotate)\b/;

function compiled(scss) {
  return sass.compileString(`@use 'motion';\n${scss}`, { loadPaths: [styles] }).css;
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blocksOf(css, selector) {
  return [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped(selector)} \\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1],
  );
}

function plainOf(css, selector) {
  const reduced = reducedOf(css, selector);
  return blocksOf(css, selector).filter((block) => block !== reduced)[0] ?? '';
}

function reducedOf(css, selector) {
  const media = css.match(
    new RegExp(
      `@media \\(prefers-reduced-motion: reduce\\) \\{\\s*${escaped(selector)} \\{([^}]*)\\}`,
    ),
  );
  return media?.[1] ?? '';
}

function startingOf(css, selector) {
  return (
    css.match(new RegExp(`@starting-style \\{\\s*${escaped(selector)} \\{([^}]*)\\}`))?.[1] ?? ''
  );
}

function valueOf(declarations, property) {
  return declarations.match(new RegExp(`(?:^|[;\\s])${escaped(property)}:\\s*([^;]+);`))?.[1] ?? '';
}

function animationNameOf(declarations) {
  return valueOf(declarations, 'animation').match(/^[\w-]+/)?.[0] ?? '';
}

function framesOf(name) {
  return (
    keyframes.match(new RegExp(`@keyframes ${escaped(name)} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
  );
}

function transitionedProperties(declarations) {
  return valueOf(declarations, 'transition')
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((property) => property !== '');
}

describe('Given a disclosure that opens through motion.expand', () => {
  const css = compiled('.panel { @include motion.expand; }');

  it('when it opens, then it starts transparent and a rise above its place from @starting-style', () => {
    const start = startingOf(css, '.panel');

    assert.match(start, /opacity:\s*0/);
    assert.match(start, /translate:\s*0 calc\(-1 \* var\(--motion-rise\)\)/);
  });

  it('when it opens, then only its opacity and its translate move, by tokens', () => {
    const plain = plainOf(css, '.panel');

    assert.deepEqual(transitionedProperties(plain).sort(), ['opacity', 'translate']);
    assert.doesNotMatch(valueOf(plain, 'transition'), /\d+(m?s)\b/);
  });

  it('when the visitor asks for less motion, then it only fades in the reduced duration', () => {
    const reduced = reducedOf(css, '.panel');

    assert.deepEqual(transitionedProperties(reduced), ['opacity']);
    assert.match(valueOf(reduced, 'transition'), /var\(--duration-reduced\)/);
    assert.match(valueOf(reduced, 'transition'), /!important/);
  });
});

describe('Given rows that come and go through motion.row-enter and motion.row-leave', () => {
  const css = compiled(`
    .row--entering { @include motion.row-enter; }
    .row--leaving { @include motion.row-leave; }
    .empty--after-rows { @include motion.after-rows-left; }
  `);

  it('when a row comes, then it moves only by opacity and translate', () => {
    const frames = framesOf(animationNameOf(plainOf(css, '.row--entering')));

    assert.match(frames, /opacity/);
    assert.doesNotMatch(frames.replace(/translate/g, ''), MOVING);
  });

  it('when a row comes and the visitor asks for less motion, then it only fades', () => {
    const reduced = reducedOf(css, '.row--entering');
    const frames = framesOf(animationNameOf(reduced));

    assert.match(frames, /opacity/);
    assert.doesNotMatch(frames, MOVING);
    assert.match(valueOf(reduced, 'animation'), /var\(--duration-reduced\)/);
  });

  it('when a row goes, then it only fades, no pointer reaches it and it is gone in the short duration', () => {
    const plain = plainOf(css, '.row--leaving');
    const frames = framesOf(animationNameOf(plain));

    assert.match(frames, /opacity/);
    assert.doesNotMatch(frames, MOVING);
    assert.equal(valueOf(plain, 'pointer-events'), 'none');
    assert.match(valueOf(plain, 'animation'), /var\(--duration-fast\)/);
  });

  it('when the last row went, then the empty state waits exactly as long as the row takes to go', () => {
    const empty = valueOf(plainOf(css, '.empty--after-rows'), 'animation');
    const leaving = valueOf(plainOf(css, '.row--leaving'), 'animation');

    assert.match(leaving, /var\(--duration-fast\)/);
    assert.match(empty, /var\(--duration-fast\)\s+backwards/);
    assert.doesNotMatch(framesOf(animationNameOf(plainOf(css, '.empty--after-rows'))), MOVING);
  });

  it('when the visitor asks for less motion, then the empty state still waits for the row and both only fade', () => {
    const empty = reducedOf(css, '.empty--after-rows');
    const leaving = reducedOf(css, '.row--leaving');

    assert.match(valueOf(leaving, 'animation-duration'), /var\(--duration-reduced\)/);
    assert.match(valueOf(empty, 'animation-delay'), /var\(--duration-reduced\)/);
    assert.match(valueOf(empty, 'animation-duration'), /var\(--duration-reduced\)/);
  });
});
