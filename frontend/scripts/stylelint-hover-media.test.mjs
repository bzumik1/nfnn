import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import stylelint from 'stylelint';
import hoverMedia, { ruleName } from './stylelint-hover-media.mjs';

async function warningsOf(code) {
  const { results } = await stylelint.lint({
    code,
    config: {
      customSyntax: 'postcss-scss',
      plugins: [hoverMedia],
      rules: { [ruleName]: true },
    },
  });
  return results[0].warnings.map((warning) => warning.text);
}

describe('Given the rule that keeps hover styles to devices that hover', () => {
  it('when a :hover rule stands outside any media query, then it is reported', async () => {
    const warnings = await warningsOf('.card:hover { transform: translateY(-4px); }');

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\.card:hover.*@media \(hover: hover\)/);
  });

  it('when a nested &:hover stands outside any media query, then it is reported', async () => {
    const warnings = await warningsOf('.card { color: red; &:hover { color: blue; } }');

    assert.equal(warnings.length, 1);
  });

  it('when a :hover rule stands inside @media (hover: hover), then nothing is reported', async () => {
    const warnings = await warningsOf(
      '@media (hover: hover) { .card:hover { transform: translateY(-4px); } }',
    );

    assert.deepEqual(warnings, []);
  });

  it('when @media (hover: hover) is nested inside the rule, then nothing is reported', async () => {
    const warnings = await warningsOf(
      '.card { @media (hover: hover) { &:hover { color: blue; } } }',
    );

    assert.deepEqual(warnings, []);
  });

  it('when a :hover rule stands inside another media query only, then it is reported', async () => {
    const warnings = await warningsOf(
      '@media (forced-colors: active) { .card:hover { outline: 1px solid CanvasText; } }',
    );

    assert.equal(warnings.length, 1);
  });

  it('when hover is combined with forced colours in one query, then nothing is reported', async () => {
    const warnings = await warningsOf(
      '@media (hover: hover) and (forced-colors: active) { .card:hover { outline: 1px solid CanvasText; } }',
    );

    assert.deepEqual(warnings, []);
  });

  it('when a selector only mentions hover in a name, then nothing is reported', async () => {
    const warnings = await warningsOf('.hover-card { color: red; }');

    assert.deepEqual(warnings, []);
  });

  it('when the rule is disabled, then nothing is reported', async () => {
    const { results } = await stylelint.lint({
      code: '.card:hover { color: blue; }',
      config: { customSyntax: 'postcss-scss', plugins: [hoverMedia], rules: { [ruleName]: null } },
    });

    assert.deepEqual(results[0].warnings, []);
  });
});
