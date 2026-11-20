import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const APP_DIRECTORY = new URL('../src/app/', import.meta.url).pathname;

const ROLE_OF_ELEMENT = {
  table: 'table',
  thead: 'rowgroup',
  tbody: 'rowgroup',
  tr: 'row',
  th: 'columnheader',
  td: 'cell',
};

const TABLE_ELEMENT_TAG = /<(table|thead|tbody|tr|th|td)(?=[\s>])([^>]*)>/g;

function templates() {
  return readdirSync(APP_DIRECTORY, { recursive: true })
    .filter((path) => path.endsWith('.html'))
    .map((path) => ({ path, text: readFileSync(join(APP_DIRECTORY, path), 'utf8') }));
}

function elementsWithoutTheirRole(text) {
  return [...text.matchAll(TABLE_ELEMENT_TAG)]
    .filter(([, element, attributes]) => !attributes.includes(`role="${ROLE_OF_ELEMENT[element]}"`))
    .map(([tag]) => tag);
}

describe('Given the tables of the app, which fold into cards on a phone', () => {
  it('when a template is read, then every table element names its role, so the folded table stays a table for a screen reader', () => {
    const missing = templates().flatMap(({ path, text }) =>
      elementsWithoutTheirRole(text).map((tag) => `${path}: ${tag}`),
    );

    assert.deepEqual(missing, []);
  });

  it('when a tag has no role, then it is reported', () => {
    assert.deepEqual(
      elementsWithoutTheirRole('<table class="ui-table"><tr role="row"><td>1</td></tr></table>'),
      ['<table class="ui-table">', '<td>'],
    );
  });
});
