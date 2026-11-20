import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

const styles = fileURLToPath(new URL('../src/styles', import.meta.url));
const keyframes = sass.compile(`${styles}/_motion-base.scss`).css;
const MOVING = /\b(transform|translate|scale|rotate)\b/;
const HEIGHT = /grid-template-rows/;

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

describe('Given a disclosure that opens and closes through motion.expand', () => {
  const css = compiled(
    `.panel { @include motion.expand; }
    .question { @include motion.expand($closes-by: class); }
    .form--leaving { @include motion.expand-content-leave; }`,
  );

  it('when it is open, then its single child fills one row that the wrapper sizes', () => {
    const plain = plainOf(css, '.panel');

    assert.equal(valueOf(plain, 'display'), 'grid');
    assert.equal(valueOf(plain, 'grid-template-rows'), '1fr');
    assert.match(blocksOf(css, '.panel > *')[0] ?? '', /min-height:\s*0/);
  });

  it('when it opens, then its child clips until the base duration has passed and lets focus rings show after it, without a raw time', () => {
    const child = blocksOf(css, '.panel > *')[0] ?? '';

    assert.equal(valueOf(child, 'overflow'), 'visible');
    assert.equal(
      valueOf(child, 'transition'),
      'overflow var(--duration-base) step-end allow-discrete',
    );
    assert.doesNotMatch(valueOf(child, 'transition'), /\d(m?s)\b/);
  });

  it('when it opens, then its height and opacity change by tokens while its visibility and display change at once, so its content takes the focus from the first frame in WebKit too', () => {
    const plain = plainOf(css, '.panel');

    assert.deepEqual(transitionedProperties(plain).sort(), ['grid-template-rows', 'opacity']);
    assert.doesNotMatch(valueOf(plain, 'transition'), /\d(m?s)\b/);
    assert.doesNotMatch(css, MOVING);
  });

  it('when it closes, then its height and opacity change by tokens and it stays visible until the height has closed', () => {
    for (const closing of [
      blocksOf(css, '.panel[hidden]')[0] ?? '',
      plainOf(css, '.question--closing'),
    ]) {
      assert.deepEqual(transitionedProperties(closing).sort(), [
        'display',
        'grid-template-rows',
        'opacity',
        'visibility',
      ]);
      assert.match(valueOf(closing, 'transition'), /visibility var\(--duration-base\) step-end/);
      assert.doesNotMatch(valueOf(closing, 'transition'), /\d(m?s)\b/);
    }
  });

  it('when it carries hidden or is inserted, then it starts from no height, transparent and out of reach', () => {
    for (const closed of [
      blocksOf(css, '.panel[hidden]')[0] ?? '',
      startingOf(css, '.panel'),
      plainOf(css, '.question--closing'),
    ]) {
      assert.equal(valueOf(closed, 'grid-template-rows'), '0fr');
      assert.match(closed, /opacity:\s*0/);
      assert.equal(valueOf(closed, 'visibility'), 'hidden');
    }
  });

  it('when it closes, then no pointer reaches it while its height still closes', () => {
    for (const closing of [
      blocksOf(css, '.panel[hidden]')[0] ?? '',
      plainOf(css, '.question--closing'),
    ]) {
      assert.equal(valueOf(closing, 'pointer-events'), 'none');
    }
    assert.equal(valueOf(plainOf(css, '.panel'), 'pointer-events'), '');
  });

  it('when an @if removes it, then it closes by its own --closing class alone and carries no closed state by hidden', () => {
    assert.equal(blocksOf(css, '.question[hidden]').length, 0);
    assert.equal(blocksOf(css, '.panel--closing').length, 0);
    assert.equal(valueOf(plainOf(css, '.question'), 'grid-template-rows'), '1fr');
    assert.equal(valueOf(startingOf(css, '.question'), 'visibility'), 'hidden');
  });

  it('when it is asked to close by anything but hidden or a class, then Sass refuses it', () => {
    assert.throws(() => compiled('.other { @include motion.expand($closes-by: timer); }'));
  });

  it('when it carries hidden and has closed, then it leaves the layout, so a closed panel adds no gap', () => {
    assert.equal(valueOf(blocksOf(css, '.panel[hidden]')[0] ?? '', 'display'), 'none');
  });

  it('when its content leaves while it closes, then the content fades and stays in the flow, and content replaced by another goes at once', () => {
    const leaving = plainOf(css, '.form--leaving');

    assert.match(valueOf(leaving, 'animation'), /^motion-leave var\(--duration-base\)/);
    assert.doesNotMatch(framesOf(animationNameOf(leaving)), MOVING);
    assert.equal(
      valueOf(blocksOf(css, '.form--leaving:not(:only-child)')[0] ?? '', 'display'),
      'none',
    );
  });

  it('when the visitor asks for less motion, then its height, visibility and display change at once on opening and only its opacity fades in the reduced duration', () => {
    const reduced = reducedOf(css, '.panel');

    assert.deepEqual(transitionedProperties(reduced), ['opacity']);
    assert.doesNotMatch(valueOf(reduced, 'transition'), HEIGHT);
    assert.match(valueOf(reduced, 'transition'), /var\(--duration-reduced\)/);
    assert.match(valueOf(reduced, 'transition'), /!important/);
  });

  it('when the visitor asks for less motion and it closes, then its height changes at once and it fades and hides in the reduced duration', () => {
    for (const selector of ['.panel[hidden]', '.question--closing']) {
      const reduced = reducedOf(css, selector);

      assert.deepEqual(transitionedProperties(reduced).sort(), [
        'display',
        'opacity',
        'visibility',
      ]);
      assert.doesNotMatch(valueOf(reduced, 'transition'), HEIGHT);
      assert.match(valueOf(reduced, 'transition'), /visibility var\(--duration-reduced\) step-end/);
      assert.match(valueOf(reduced, 'transition'), /!important/);
    }
  });
});

describe('Given rows that come and go through motion.row-enter and motion.row-leave', () => {
  const css = compiled(`
    .row--entering { @include motion.row-enter; }
    .row--leaving { @include motion.row-leave; }
    .empty--after-rows { @include motion.after-rows-left; }
  `);

  function animationNames(declarations) {
    return valueOf(declarations, 'animation')
      .split(',')
      .map((part) => part.trim().match(/^[\w-]+/)?.[0] ?? '');
  }

  it('when a row comes, then it only fades in and shortly takes a tint, without a rise', () => {
    const names = animationNames(plainOf(css, '.row--entering'));
    const frames = names.map(framesOf).join('\n');

    assert.match(frames, /opacity/);
    assert.match(frames, /background-color/);
    assert.doesNotMatch(frames, MOVING);
    assert.doesNotMatch(frames, /--motion-rise/);
  });

  it('when a row comes and the visitor asks for less motion, then it only fades', () => {
    const reduced = reducedOf(css, '.row--entering');
    const frames = framesOf(animationNameOf(reduced));

    assert.match(frames, /opacity/);
    assert.doesNotMatch(frames, MOVING);
    assert.doesNotMatch(frames, /background-color/);
    assert.match(valueOf(reduced, 'animation'), /var\(--duration-reduced\)/);
  });

  it('when a row goes, then its height closes with its fade, no pointer reaches it and it is gone in the short duration', () => {
    const plain = plainOf(css, '.row--leaving');
    const frames = framesOf(animationNameOf(plain));

    assert.match(frames, /grid-template-rows: 0fr/);
    assert.match(frames, /opacity: 0/);
    assert.doesNotMatch(frames, MOVING);
    assert.equal(valueOf(plain, 'display'), 'grid');
    assert.equal(valueOf(plain, 'pointer-events'), 'none');
    assert.match(valueOf(plain, 'animation'), /var\(--duration-fast\)/);
  });

  it('when a row goes and the visitor asks for less motion, then its height does not move and it only fades', () => {
    const frames = framesOf(animationNameOf(reducedOf(css, '.row--leaving')));

    assert.match(frames, /opacity/);
    assert.doesNotMatch(frames, HEIGHT);
  });

  it('when the last row went, then the empty state waits out of the flow exactly as long as the row takes to go', () => {
    const empty = plainOf(css, '.empty--after-rows');
    const leaving = valueOf(plainOf(css, '.row--leaving'), 'animation');
    const frames = framesOf(animationNameOf(empty));

    assert.match(leaving, /var\(--duration-fast\)/);
    assert.match(valueOf(empty, 'animation'), /var\(--duration-fast\)\s+backwards/);
    assert.match(frames, /from \{[^}]*position: absolute/);
    assert.match(frames, /position: static/);
    assert.doesNotMatch(frames, MOVING);
  });

  it('when the visitor asks for less motion, then the empty state still waits for the row and both only fade', () => {
    const empty = reducedOf(css, '.empty--after-rows');
    const leaving = reducedOf(css, '.row--leaving');

    assert.match(valueOf(leaving, 'animation'), /var\(--duration-reduced\)/);
    assert.match(valueOf(empty, 'animation-delay'), /var\(--duration-reduced\)/);
    assert.match(valueOf(empty, 'animation-duration'), /var\(--duration-reduced\)/);
  });
});

describe('Given a long wait through motion.wait-settles and motion.wait-calm', () => {
  const css = compiled(`
    .spinner { @include motion.wait-settles; }
    .still { @include motion.wait-calm; }
  `);

  it('when the wait has lasted the calm duration, then the moving indicator fades out and a still one fades in', () => {
    assert.match(
      valueOf(plainOf(css, '.spinner'), 'animation'),
      /var\(--duration-calm\)\s+forwards/,
    );
    assert.match(
      valueOf(plainOf(css, '.still'), 'animation'),
      /var\(--duration-calm\)\s+backwards/,
    );
    assert.doesNotMatch(framesOf(animationNameOf(plainOf(css, '.still'))), MOVING);
  });

  it('when the visitor asks for less motion, then only the still indicator shows from the start', () => {
    const spinner = reducedOf(css, '.spinner');

    assert.match(spinner, /opacity:\s*0/);
    assert.match(valueOf(spinner, 'animation'), /none/);
    assert.match(valueOf(reducedOf(css, '.still'), 'animation'), /none/);
  });
});

describe('Given the body of native details that opens through motion.expand-on-open', () => {
  const css = compiled(`.body { @include motion.expand-on-open; }`);

  it('when the details open, then the body opens its single row from nothing and fades in, its child clipped while it opens', () => {
    const plain = plainOf(css, '.body');

    assert.equal(valueOf(plain, 'display'), 'grid');
    assert.equal(valueOf(plain, 'grid-template-rows'), '1fr');
    assert.match(framesOf(animationNameOf(plain)), /grid-template-rows:\s*0fr/);
    assert.match(valueOf(plain, 'animation'), /motion-fade-in/);
    const child = plainOf(css, '.body > *');
    assert.match(child, /min-height:\s*0/);
    assert.match(framesOf(animationNameOf(child)), /overflow:\s*clip/);
  });

  it('when the visitor asks for less motion, then the body only fades in and its child is never clipped', () => {
    const reduced = reducedOf(css, '.body');

    assert.equal(animationNameOf(reduced), 'motion-fade-in');
    assert.doesNotMatch(valueOf(reduced, 'animation'), HEIGHT);
    assert.match(valueOf(reducedOf(css, '.body > *'), 'animation'), /none/);
  });
});

describe('Given every fold that clips its child while its height changes', () => {
  const css = compiled(
    `.panel { @include motion.expand; }
    .question { @include motion.expand($closes-by: class); }
    .body { @include motion.expand-on-open; }
    .row--leaving { @include motion.row-leave; }`,
  );
  const startingChild = (selector) =>
    css.match(
      new RegExp(`@starting-style \\{[^@]*?${escaped(`${selector} > *`)} \\{([^}]*)\\}`),
    )?.[1] ?? '';
  const clipping = [
    startingChild('.panel'),
    startingChild('.question'),
    blocksOf(css, '.panel[hidden] > *')[0] ?? '',
    blocksOf(css, '.question--closing > *')[0] ?? '',
    framesOf(animationNameOf(plainOf(css, '.body > *'))),
    blocksOf(css, '.row--leaving > *')[0] ?? '',
  ];

  it('when it opens, closes or leaves, then its child clips without becoming a scroll box, so a focus or a scroll into view inside it never moves its content', () => {
    for (const declarations of clipping) {
      assert.equal(valueOf(declarations, 'overflow'), 'clip');
    }
  });

  it('when it clips, then its child may still grow narrower than its content, as a scroll box could, so a closed fold never widens its row', () => {
    for (const declarations of clipping) {
      assert.equal(valueOf(declarations, 'min-inline-size'), '0');
    }
  });
});

describe('Given a change of how wide a card or its columns are', () => {
  for (const property of [
    'inline-size',
    'min-inline-size',
    'max-inline-size',
    'grid-template-columns',
    'flex-basis',
  ]) {
    it(`when ${property} is asked to change by state or hover, then Sass refuses it, as it does width`, () => {
      assert.throws(
        () => compiled(`.card { @include motion.state(${property}); }`),
        /never animated/,
      );
      assert.throws(
        () => compiled(`.card { @include motion.hover(${property}); }`),
        /never animated/,
      );
    });
  }

  it('when width is asked to change by state, then Sass refuses it too', () => {
    assert.throws(() => compiled('.card { @include motion.state(width); }'), /never animated/);
  });
});
