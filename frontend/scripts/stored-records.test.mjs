import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const storedRecords = JSON.parse(
  readFileSync(new URL('../src/app/core/version/stored-records.json', import.meta.url), 'utf8'),
);

function componentsOf(source, record) {
  const start = new RegExp(`\\brecord\\s+${record}\\s*\\(`).exec(source);
  assert.ok(start, `the Java source declares the record ${record}`);
  const components = [];
  let depth = 0;
  let current = '';
  for (const character of source.slice(start.index + start[0].length)) {
    if (depth === 0 && (character === ',' || character === ')')) {
      components.push(current.trim());
      current = '';
      if (character === ')') {
        break;
      }
      continue;
    }
    if (character === '<' || character === '(') {
      depth++;
    }
    if (character === '>' || character === ')') {
      depth--;
    }
    current += character;
  }
  return components
    .filter((component) => component !== '')
    .map((component) => component.split(/\s+/).at(-1));
}

function javaSource(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('Given the stored records the backend answers in a changed-meanwhile refusal', () => {
  for (const [caller, { source, record, keys }] of Object.entries(storedRecords)) {
    it(`when the ${caller} record ${record} is read from the backend, then the frontend names exactly its components`, () => {
      assert.deepEqual(componentsOf(javaSource(source), record), keys);
    });
  }

  it('when a record gains a component, then the comparison notices it', () => {
    const { source, record, keys } = storedRecords.newsArticle;
    const grown = javaSource(source).replace(
      new RegExp(`(record\\s+${record}\\s*\\()`),
      '$1Integer storyYear, ',
    );

    assert.notDeepEqual(componentsOf(grown, record), keys);
  });

  it('when a component has a generic type with two parameters, then it still counts as one', () => {
    assert.deepEqual(
      componentsOf('public record Row(Map<String, Integer> counts, List<String> names) {}', 'Row'),
      ['counts', 'names'],
    );
  });
});
