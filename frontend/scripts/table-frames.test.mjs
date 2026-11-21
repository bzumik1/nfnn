import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as sass from 'sass';

const SOURCE_DIRECTORY = new URL('../src/', import.meta.url).pathname;
const APP_DIRECTORY = new URL('../src/app/', import.meta.url).pathname;
const STYLES_DIRECTORY = new URL('../src/styles/', import.meta.url).pathname;
const UI_DIRECTORY = new URL('../src/styles/ui/', import.meta.url).pathname;
const TABLE_STYLES = new URL('../src/styles/ui/_table.scss', import.meta.url).pathname;
const THEMES = ['control', 'nova-nadeje'].map((theme) => ({
  theme,
  path: new URL(`../src/themes/${theme}/_theme.scss`, import.meta.url).pathname,
}));

const TABLES_WITH_THEIR_OWN_CONTAINER = [
  'features/donors/dashboard/donations-table/donations-table.html',
];

const LIST_CONTAINERS_IN_A_CARD = ['.ui-card > .ui-list', '.ui-card__group'];

const TABLE_TAG = /<table(?=[\s>])[^>]*>/g;
const FRAME_BEFORE_TABLE = /<[a-z-]+\s[^>]*class="[^"]*\bui-table-frame\b[^"]*"[^>]*>\s*$/;
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr', 'col']);

function templates() {
  return readdirSync(APP_DIRECTORY, { recursive: true })
    .filter((path) => path.endsWith('.html'))
    .map((path) => ({ path, text: readFileSync(join(APP_DIRECTORY, path), 'utf8') }));
}

function compiledStyles() {
  return [
    ...readdirSync(APP_DIRECTORY, { recursive: true }).map((path) => join(APP_DIRECTORY, path)),
    ...readdirSync(UI_DIRECTORY).map((path) => join(UI_DIRECTORY, path)),
  ]
    .filter((path) => path.endsWith('.scss'))
    .map((path) => ({
      path: path.slice(SOURCE_DIRECTORY.length),
      css: sass.compile(path, { loadPaths: [STYLES_DIRECTORY], logger: sass.Logger.silent }).css,
    }));
}

function tablesOutsideTheirFrame(text) {
  return [...text.matchAll(TABLE_TAG)]
    .filter(({ 0: tag, index }) => {
      const framed = FRAME_BEFORE_TABLE.test(text.slice(0, index));
      return !framed || !/class="[^"]*\bui-table\b/.test(tag);
    })
    .map(([tag]) => tag);
}

function classesOf(tag) {
  return (tag.match(/\sclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);
}

function cardClassesOf(text) {
  return [...text.matchAll(/<[a-z][\w-]*\s[^>]*>/g)]
    .map(([tag]) => classesOf(tag))
    .filter((classes) => classes.includes('ui-card'));
}

function titlesInANestedContainer(text) {
  const open = [];
  const nested = [];
  for (const [tag, closing, name] of text.matchAll(/<(\/?)([a-z][\w-]*)(?:\s[^>]*)?>/g)) {
    if (closing) {
      const at = open.findLastIndex((element) => element.name === name);
      if (at >= 0) {
        open.length = at;
      }
      continue;
    }
    const classes = classesOf(tag);
    const parent = open.at(-1);
    const container = classes.includes('ui-card')
      ? 'card'
      : classes.includes('ui-card__group') ||
          (classes.includes('ui-list') && parent?.container === 'card')
        ? 'list'
        : null;
    if (classes.includes('ui-card__title')) {
      const nearest = open.findLast((element) => element.container)?.container;
      if (nearest === 'list') {
        nested.push(tag);
      }
    }
    if (!VOID_ELEMENTS.has(name) && !tag.endsWith('/>')) {
      open.push({ name, container });
    }
  }
  return nested;
}

function withoutArguments(selector) {
  let previous;
  let current = selector;
  do {
    previous = current;
    current = current.replace(/\([^()]*\)/g, '');
  } while (current !== previous);
  return current;
}

function rulesOf(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, declarations]) => ({
      selectors: selector
        .trim()
        .split(/,(?![^()]*\))/)
        .map((part) => part.trim().replace(/\s+/g, ' ')),
      declarations,
    }))
    .filter(({ selectors }) => !selectors[0].startsWith('@'));
}

function declared(declarations, property) {
  return declarations.match(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+)`))?.[1]?.trim();
}

function containerOf(declarations) {
  const container = [
    ...declarations.matchAll(/(?:^|[;{\s])(container(?:-name|-type)?):\s*([^;]+)/g),
  ].reduce((cascaded, [, property, rawValue]) => {
    const value = rawValue.trim();
    if (property === 'container-name') {
      return { ...cascaded, names: value };
    }
    if (property === 'container-type') {
      return { ...cascaded, type: value };
    }
    const [names, type = 'normal'] = value.split('/').map((part) => part.trim());
    return { names, type, shorthand: value };
  }, null);
  if (container === null) {
    return null;
  }
  return { ...container, names: (container.names ?? '').split(/\s+/).filter(Boolean) };
}

function lastCompound(selector) {
  return (
    withoutArguments(selector)
      .split(/\s*[\s>+~]\s*/)
      .at(-1) ?? ''
  );
}

function hasClass(compound, name) {
  return new RegExp(`\\.${name.replace(/[-]/g, '\\-')}(?![\\w-])`).test(compound);
}

function cardRuleSelectors(selectors, cardClasses) {
  return selectors.filter(
    (selector) =>
      LIST_CONTAINERS_IN_A_CARD.includes(selector) ||
      cardClasses.some((name) => hasClass(lastCompound(selector), name)),
  );
}

function cardContainerProblems(css, cardClasses) {
  return rulesOf(css).flatMap(({ selectors, declarations }) => {
    const container = containerOf(declarations);
    const card = cardRuleSelectors(selectors, cardClasses);
    if (!container || card.length === 0) {
      return [];
    }
    const problems = [];
    if (!container.names.includes('ui-card')) {
      problems.push(`${card.join(', ')}: container ${container.names.join(' ')} without ui-card`);
    }
    if (container.type !== 'inline-size') {
      problems.push(`${card.join(', ')}: container-type ${container.type}, not inline-size`);
    }
    return problems;
  });
}

function cardContainerOf(css) {
  return rulesOf(css)
    .filter(({ selectors }) => selectors.includes('.ui-card'))
    .map(({ declarations }) => ({
      name: declared(declarations, 'container-name'),
      type: declared(declarations, 'container-type'),
      shorthand: declared(declarations, 'container'),
    }))
    .find(({ name, type, shorthand }) => name || type || shorthand);
}

function tableContainersOutsideTheFrame(css) {
  return rulesOf(css).flatMap(({ selectors, declarations }) =>
    containerOf(declarations)?.names.includes('ui-table') &&
    selectors.some((selector) => selector !== '.ui-table-frame')
      ? [selectors.join(', ')]
      : [],
  );
}

function cardsSizedByTheirContent(css, cardClasses) {
  return rulesOf(css).flatMap(({ selectors, declarations }) => {
    const card = cardRuleSelectors(selectors, cardClasses).filter(
      (selector) => !LIST_CONTAINERS_IN_A_CARD.includes(selector),
    );
    const sizing = [
      /fit-content/.test(declarations) && 'fit-content',
      /(?:^|[;{\s])display:\s*inline-flex/.test(declarations) && 'inline-flex',
      /(?:^|[;{\s])float:\s*(?!\s|none\b)/.test(declarations) && 'float',
    ].filter(Boolean);
    return card.length > 0 && sizing.length > 0 ? [`${card.join(', ')}: ${sizing.join(', ')}`] : [];
  });
}

function cardTitlesThatHyphenate(css) {
  return rulesOf(css).flatMap(({ selectors, declarations }) =>
    selectors.some((selector) => hasClass(lastCompound(selector), 'ui-card__title')) &&
    /(?:^|[;{\s])(?:-webkit-)?hyphens:\s*auto/.test(declarations)
      ? [selectors.join(', ')]
      : [],
  );
}

function cardTitleTokenProblems(theme) {
  const value = theme
    .match(/--text-card-title:\s*([^;]+);/)?.[1]
    ?.replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
  if (!value) {
    return ['no --text-card-title'];
  }
  return [
    !/^max\(var\(--text-sheet-body\), min\(var\(--text-2xl\), /.test(value) &&
      'not max(var(--text-sheet-body), min(var(--text-2xl), …))',
    !/\(100cqi - 2 \* var\(--card-inset\)\)/.test(value) && 'not 100cqi - 2 * var(--card-inset)',
    /--space-6/.test(value) && 'subtracts --space-6',
  ].filter(Boolean);
}

function registeredCardTitle(text) {
  return /@property\s+--text-card-title(?![\w-])/.test(text);
}

const SOURCE_STYLES = readdirSync(SOURCE_DIRECTORY, { recursive: true })
  .filter((path) => path.endsWith('.scss') || path.endsWith('.css'))
  .map((path) => ({ path, text: readFileSync(join(SOURCE_DIRECTORY, path), 'utf8') }));

describe('Given the tables of the app, which fold into cards by the width of their card', () => {
  it('when a template is read, then every table is a ui-table directly inside a ui-table-frame', () => {
    const outside = templates()
      .filter(({ path }) => !TABLES_WITH_THEIR_OWN_CONTAINER.includes(path))
      .flatMap(({ path, text }) => tablesOutsideTheirFrame(text).map((tag) => `${path}: ${tag}`));

    assert.deepEqual(outside, []);
  });

  it('when a table has no frame or no ui-table class, then it is reported', () => {
    assert.deepEqual(
      tablesOutsideTheirFrame(
        '<div class="ui-table-frame"><table role="table" class="ui-table"></table></div>' +
          '<table role="table" class="ui-table"></table>' +
          '<div class="ui-table-frame"><table role="table"></table></div>',
      ),
      ['<table role="table" class="ui-table">', '<table role="table">'],
    );
  });

  it('when the table block is read, then the frame is the size container and the table folds at ledger only', () => {
    const styles = readFileSync(TABLE_STYLES, 'utf8');

    assert.match(styles, /\.ui-table-frame\s*\{[^}]*container:\s*ui-table\s*\/\s*inline-size/);
    assert.match(styles, /@include bp\.container-down\(ui-table, ledger\)/);
    assert.doesNotMatch(styles, /@include bp\.down\(/);
    assert.doesNotMatch(styles, /transition|@starting-style|motion\./);
  });

  it('when the table block is read, then its edge cells take the card inset token', () => {
    const styles = readFileSync(TABLE_STYLES, 'utf8');

    assert.match(styles, /padding-inline-start:\s*var\(--card-inset\)/);
    assert.match(styles, /padding-inline-end:\s*var\(--card-inset\)/);
    assert.doesNotMatch(styles, /--space-6/);
  });

  it('when every style is read, then only the frame is the ui-table container', () => {
    const outside = compiledStyles().flatMap(({ path, css }) =>
      tableContainersOutsideTheFrame(css).map((selector) => `${path}: ${selector}`),
    );

    assert.deepEqual(outside, []);
  });

  it('when another rule names the ui-table container, then it is reported', () => {
    assert.deepEqual(
      tableContainersOutsideTheFrame(
        '.ui-table-frame { container: ui-table / inline-size; }\n' +
          '.ui-card { container: ui-table / inline-size; }\n' +
          '.other { container-name: ui-table; container-type: inline-size; }',
      ),
      ['.ui-card', '.other'],
    );
  });
});

describe('Given the cards of the app, whose titles take their size from the width of their card', () => {
  const styles = compiledStyles();
  const cardClasses = [...new Set(templates().flatMap(({ text }) => cardClassesOf(text).flat()))];

  it('when the card block is read, then every card is an inline-size container named ui-card', () => {
    const card = cardContainerOf(styles.find(({ path }) => path.endsWith('ui/_card.scss')).css);

    assert.deepEqual(card, { name: 'ui-card', type: 'inline-size', shorthand: undefined });
  });

  it('when a rule of a card or of a list inside it declares a container, then it keeps the name ui-card and the type inline-size', () => {
    const problems = styles.flatMap(({ path, css }) =>
      cardContainerProblems(css, cardClasses).map((problem) => `${path}: ${problem}`),
    );

    assert.deepEqual(problems, []);
  });

  it('when a card rule names its container without ui-card, by a shorthand, or with the type size, then it is reported', () => {
    assert.deepEqual(
      cardContainerProblems(
        '.attention { container: attention / inline-size; }\n' +
          '.ui-card__group { container: list-card / inline-size; }\n' +
          '.profile-card { container-name: ui-card profile-card; container-type: size; }\n' +
          '.ok-card { container-name: ui-card ok-card; container-type: inline-size; }\n' +
          '.not-a-card { container: other / inline-size; }',
        ['ui-card', 'attention', 'profile-card', 'ok-card'],
      ),
      [
        '.attention: container attention without ui-card',
        '.ui-card__group: container list-card without ui-card',
        '.profile-card: container-type size, not inline-size',
      ],
    );
  });

  it('when a later declaration of a card rule overrides the name or the type, then the one that wins the cascade is checked', () => {
    assert.deepEqual(
      cardContainerProblems(
        '.attention { container-name: ui-card attention; container-type: inline-size; container: attention / inline-size; }\n' +
          '.profile-card { container: ui-card profile-card / inline-size; container-type: size; }\n' +
          '.ok-card { container: ok-card / size; container-name: ui-card ok-card; container-type: inline-size; }',
        ['ui-card', 'attention', 'profile-card', 'ok-card'],
      ),
      [
        '.attention: container attention without ui-card',
        '.profile-card: container-type size, not inline-size',
      ],
    );
  });

  it('when the card block is read and the ui-card container is a shorthand or of size, then the card is not accepted', () => {
    assert.notDeepEqual(cardContainerOf('.ui-card { container: ui-card / inline-size; }'), {
      name: 'ui-card',
      type: 'inline-size',
      shorthand: undefined,
    });
    assert.notDeepEqual(
      cardContainerOf('.ui-card { container-name: ui-card; container-type: size; }'),
      { name: 'ui-card', type: 'inline-size', shorthand: undefined },
    );
  });

  it('when every style is read, then no card takes its width from its content', () => {
    const problems = styles.flatMap(({ path, css }) =>
      cardsSizedByTheirContent(css, cardClasses).map((problem) => `${path}: ${problem}`),
    );

    assert.deepEqual(problems, []);
  });

  it('when a card is fit-content, inline-flex or floats, then it is reported', () => {
    assert.deepEqual(
      cardsSizedByTheirContent(
        '.ui-card { inline-size: fit-content; }\n' +
          '.attention { display: inline-flex; }\n' +
          '.side .ui-card { float: inline-end; }\n' +
          '.ui-card { float: none; display: block; }\n' +
          '.ui-card .ui-button { display: inline-flex; }',
        ['ui-card', 'attention'],
      ),
      ['.ui-card: fit-content', '.attention: inline-flex', '.side .ui-card: float'],
    );
  });

  it('when every style is read, then no card title hyphenates', () => {
    const problems = styles.flatMap(({ path, css }) =>
      cardTitlesThatHyphenate(css).map((selector) => `${path}: ${selector}`),
    );

    assert.deepEqual(problems, []);
  });

  it('when a card title hyphenates, then it is reported', () => {
    assert.deepEqual(
      cardTitlesThatHyphenate(
        '.ui-card__title { overflow-wrap: break-word; }\n' +
          '.lock .ui-card__title { hyphens: auto; }\n' +
          '.ui-card__intro { hyphens: auto; }',
      ),
      ['.lock .ui-card__title'],
    );
  });

  it('when a template is read, then every card title lies in its card and never in a list container inside it', () => {
    const nested = templates().flatMap(({ path, text }) =>
      titlesInANestedContainer(text).map((tag) => `${path}: ${tag}`),
    );

    assert.deepEqual(nested, []);
  });

  it('when a card title lies in a group or in the list of its card, then it is reported', () => {
    assert.deepEqual(
      titlesInANestedContainer(
        '<section class="ui-card"><div class="ui-card__bar"><h2 class="ui-card__title">A</h2></div>' +
          '<div class="ui-card__group"><h3 class="ui-card__title">B</h3></div>' +
          '<ul class="ui-list"><li><h3 class="ui-card__title">C</h3></li></ul>' +
          '<div><ul class="ui-list"><li><h3 class="ui-card__title">D</h3></li></ul></div>' +
          '<img src="x.svg" alt=""><h2 class="ui-card__title">E</h2></section>',
      ),
      ['<h3 class="ui-card__title">', '<h3 class="ui-card__title">'],
    );
  });

  for (const { theme, path } of THEMES) {
    it(`when the ${theme} theme is read, then the card title is --text-2xl capped by the card's width less its insets and never below the sheet body text`, () => {
      assert.deepEqual(cardTitleTokenProblems(readFileSync(path, 'utf8')), []);
    });
  }

  it('when the card title token subtracts another space, drops its floor or is missing, then it is reported', () => {
    assert.deepEqual(
      cardTitleTokenProblems(
        '--text-card-title: max(var(--text-sheet-body), min(var(--text-2xl), (100cqi - 2 * var(--space-6)) / 6.25));',
      ),
      ['not 100cqi - 2 * var(--card-inset)', 'subtracts --space-6'],
    );
    assert.deepEqual(
      cardTitleTokenProblems(
        '--text-card-title: min(var(--text-2xl), (100cqi - 2 * var(--card-inset)) / 6.25);',
      ),
      ['not max(var(--text-sheet-body), min(var(--text-2xl), …))'],
    );
    assert.deepEqual(cardTitleTokenProblems(':root {}'), ['no --text-card-title']);
  });

  it('when every style is read, then --text-card-title is never registered, so cqi resolves at each title', () => {
    assert.deepEqual(
      SOURCE_STYLES.filter(({ text }) => registeredCardTitle(text)).map(({ path }) => path),
      [],
    );
  });

  it('when --text-card-title is registered, then it is reported', () => {
    assert.equal(
      registeredCardTitle(
        "@property --text-card-title { syntax: '<length>'; inherits: true; initial-value: 0; }",
      ),
      true,
    );
    assert.equal(registeredCardTitle('@property --text-card-title-other {}'), false);
  });
});
