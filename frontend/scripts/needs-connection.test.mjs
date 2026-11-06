import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  controlsWithoutDirective,
  findings,
  importsDirective,
  usesDirective,
} from './needs-connection.mjs';

describe('Given the controls of the app that need a connection', () => {
  it('when every submit button, every danger button and every button whose click reaches the server carries appNeedsConnection and its component imports it, then nothing is reported', () => {
    assert.deepEqual(findings(), []);
  });

  it('when a submit button does not carry it, then the button is reported with its line', () => {
    const template = '<form>\n  <button class="ui-button" type="submit">Uložit</button>\n</form>';

    assert.deepEqual(
      controlsWithoutDirective(template).map((control) => control.line),
      [2],
    );
  });

  it('when a button names no type, so a form would submit through it, then it counts as a submit button', () => {
    const template = '<form>\n  <button class="ui-button">Uložit</button>\n</form>';

    assert.equal(controlsWithoutDirective(template).length, 1);
  });

  it('when a control listed as working without a connection no longer exists, then the stale entry is reported', () => {
    const stale = {
      'layout/offline-status/offline-status.html#tryAgain': 'still there',
      'layout/offline-status/offline-status.html#gone': 'removed since',
      'features/nowhere/nowhere.html': 'removed since',
    };

    assert.deepEqual(
      findings(stale).filter((finding) => finding.includes('listed as working')),
      [
        'layout/offline-status/offline-status.html#gone: listed as working without a connection, but no such control exists',
        'features/nowhere/nowhere.html: listed as working without a connection, but no such control exists',
      ],
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

  it('when a button calls a method of its component that subscribes, directly or through another of its methods, then it is reported', () => {
    const component = [
      'export class Card {',
      '  protected unpublish(): void {',
      '    this.api.unpublish(this.id).subscribe(() => this.done.set(true));',
      '  }',
      '',
      '  protected move(member: Member, direction: string): void {',
      "    this.saving.set(direction === 'up');",
      '    this.saveOrder(member);',
      '  }',
      '',
      '  private saveOrder(member: Member): void {',
      '    if (member) {',
      '      this.api.order([member.id]).subscribe();',
      '    }',
      '  }',
      '',
      '  protected async reveal(): Promise<void> {',
      '    this.key.set(await firstValueFrom(this.api.key()));',
      '  }',
      '}',
    ].join('\n');
    const template = [
      '<button type="button" class="ui-button" (click)="unpublish()">Stáhnout z webu</button>',
      '<button type="button" (click)="move(member, \'up\')">Nahoru</button>',
      '<button type="button" (click)="reveal(); shown.set(true)">Zobrazit</button>',
    ].join('\n');

    assert.deepEqual(
      controlsWithoutDirective(template, component).map((control) => control.line),
      [1, 2, 3],
    );
  });

  it('when a button calls a method that only changes what the page shows, then it is not reported', () => {
    const component = [
      'export class Card {',
      '  protected toggle(): void {',
      '    this.open.update((open) => !open);',
      '  }',
      '}',
    ].join('\n');
    const template = '<button type="button" (click)="toggle()">Více</button>';

    assert.deepEqual(controlsWithoutDirective(template, component), []);
  });

  it('when a button that reaches the server is listed as working without a connection, then it is not reported', () => {
    const component = [
      'export class TopBar {',
      '  protected logout(): void {',
      '    this.auth.logout().subscribe();',
      '  }',
      '}',
    ].join('\n');
    const template = '<button type="button" (click)="logout()">Odhlásit</button>';

    assert.deepEqual(controlsWithoutDirective(template, component, new Set(['logout'])), []);
  });

  it('when a danger button calls only handlers listed as working without a connection, then it is not reported, and a submit button still is', () => {
    const template = [
      '<button type="button" class="ui-button ui-button--danger-soft" (click)="signOut()">Odhlásit se</button>',
      '<button type="button" class="ui-button ui-button--danger" (click)="signOut(); remove()">Odebrat</button>',
      '<button type="submit" class="ui-button ui-button--danger" (click)="signOut()">Smazat</button>',
    ].join('\n');

    assert.deepEqual(
      controlsWithoutDirective(template, '', new Set(['signOut'])).map((control) => control.line),
      [2, 3],
    );
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
