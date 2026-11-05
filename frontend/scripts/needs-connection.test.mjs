import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  controlsWithoutDirective,
  findings,
  importsDirective,
  usesDirective,
} from './needs-connection.mjs';

describe('Given the controls of the app that need a connection', () => {
  it('when every submit button and every danger button carries appNeedsConnection and its component imports it, then nothing is reported', () => {
    assert.deepEqual(findings(), []);
  });

  it('when a submit button does not carry it, then the button is reported with its line', () => {
    const template = '<form>\n  <button class="ui-button" type="submit">Uložit</button>\n</form>';

    assert.deepEqual(
      controlsWithoutDirective(template).map((control) => control.line),
      [2],
    );
  });

  it('when a button that deletes or removes at once does not carry it, then it is reported', () => {
    for (const modifier of ['ui-button--danger', 'ui-button--danger-soft']) {
      const template = `<button type="button" class="ui-button ${modifier}" (click)="remove()">Odebrat</button>`;

      assert.equal(controlsWithoutDirective(template).length, 1, modifier);
    }
  });

  it('when a button only opens a confirmation or does nothing on the server, then it is not reported', () => {
    const template = [
      '<button type="button" class="ui-button ui-button--danger-outline" (click)="ask()">Smazat…</button>',
      '<button type="button" class="ui-button" (click)="close()">Zavřít</button>',
    ].join('\n');

    assert.deepEqual(controlsWithoutDirective(template), []);
  });

  it('when the button carries it, also over several lines and beside other attributes, then it is not reported', () => {
    const template = [
      '<button',
      '  type="submit"',
      '  class="ui-button ui-button--danger"',
      '  appNeedsConnection',
      '  [disabled]="busy() > 1"',
      '>',
    ].join('\n');

    assert.deepEqual(controlsWithoutDirective(template), []);
    assert.equal(usesDirective(template), true);
  });

  it('when a name only contains the directive’s name, then it does not count as the directive', () => {
    const template = '<button type="submit" data-appNeedsConnectionLater>Odeslat</button>';

    assert.equal(controlsWithoutDirective(template).length, 1);
  });

  it('when the component of a template that uses it imports NeedsConnection, then the import is found, and not otherwise', () => {
    assert.equal(importsDirective('imports: [FormsModule, NeedsConnection],'), true);
    assert.equal(
      importsDirective('imports: [\n    FormsModule,\n    NeedsConnection,\n  ],'),
      true,
    );
    assert.equal(importsDirective('imports: [FormsModule],\n// NeedsConnection'), false);
  });
});
