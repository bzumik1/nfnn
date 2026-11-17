import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Disclosure } from './disclosure';

@Component({
  imports: [Disclosure],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="panel" appDisclosure [closed]="closed()"><button type="button">Uložit</button></div>
    @if (asking()) {
      <div id="question" appDisclosure><button type="button">Ponechat</button></div>
    }
  `,
})
class DisclosureHost {
  readonly closed = signal(true);
  readonly asking = signal(true);
}

describe('Given a disclosure', () => {
  let fixture: ComponentFixture<DisclosureHost>;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function byId(id: string): HTMLElement {
    return fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(DisclosureHost);
    await settle();
  });

  it('when it is closed, then it is hidden and inert, so neither Tab nor a screen reader reaches its controls', () => {
    expect(byId('panel').hidden).toBe(true);
    expect(byId('panel').hasAttribute('inert')).toBe(true);
  });

  it('when it opens, then it is shown and stops being inert at once, so its content can take the focus', async () => {
    fixture.componentInstance.closed.set(false);
    await settle();

    expect(byId('panel').hidden).toBe(false);
    expect(byId('panel').hasAttribute('inert')).toBe(false);
  });

  it('when it closes again, then it is inert at once, while its height may still be closing', async () => {
    fixture.componentInstance.closed.set(false);
    await settle();
    fixture.componentInstance.closed.set(true);
    await settle();

    expect(byId('panel').hasAttribute('inert')).toBe(true);
  });

  it('when an @if inserts it, then it is shown and not inert', () => {
    expect(byId('question').hidden).toBe(false);
    expect(byId('question').hasAttribute('inert')).toBe(false);
  });

  it('when an @if removes it, then it is inert from that moment, so nothing reaches it while it leaves', async () => {
    const question = byId('question');

    fixture.componentInstance.asking.set(false);
    await settle();

    expect(question.hasAttribute('inert')).toBe(true);
  });
});
