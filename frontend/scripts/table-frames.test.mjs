import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const APP_DIRECTORY = new URL('../src/app/', import.meta.url).pathname;
const TABLE_STYLES = new URL('../src/styles/ui/_table.scss', import.meta.url).pathname;
const CARD_STYLES = new URL('../src/styles/ui/_card.scss', import.meta.url).pathname;

const TABLES_WITH_THEIR_OWN_CONTAINER = [
  'features/donors/dashboard/donations-table/donations-table.html',
];

const TABLE_TAG = /<table(?=[\s>])[^>]*>/g;
const FRAME_BEFORE_TABLE = /<[a-z-]+\s[^>]*class="[^"]*\bui-table-frame\b[^"]*"[^>]*>\s*$/;

function templates() {
  return readdirSync(APP_DIRECTORY, { recursive: true })
    .filter((path) => path.endsWith('.html'))
    .map((path) => ({ path, text: readFileSync(join(APP_DIRECTORY, path), 'utf8') }));
}

function tablesOutsideTheirFrame(text) {
  return [...text.matchAll(TABLE_TAG)]
    .filter(({ 0: tag, index }) => {
      const framed = FRAME_BEFORE_TABLE.test(text.slice(0, index));
      return !framed || !/class="[^"]*\bui-table\b/.test(tag);
    })
    .map(([tag]) => tag);
}

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

  it('when the card block is read, then the card itself is never a size container', () => {
    assert.doesNotMatch(readFileSync(CARD_STYLES, 'utf8'), /container(-type)?:/);
  });
});
