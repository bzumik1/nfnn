import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Disclosure } from './disclosure';

@Component({
  imports: [Disclosure],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      id="toggle"
      type="button"
      [attr.aria-expanded]="!closed()"
      (click)="closed.set(!closed())"
    >
      Změnit
    </button>
    <div id="panel" appDisclosure [closed]="closed()" (unfolded)="unfoldings.set(unfoldings() + 1)">
      <button type="button">Uložit</button>
    </div>
    @if (asking()) {
      <div id="question" appDisclosure><button type="button">Ponechat</button></div>
    }
  `,
})
class DisclosureHost {
  readonly closed = signal(true);
  readonly asking = signal(true);
  readonly unfoldings = signal(0);
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

  it('when it is closed, then it is out of the accessibility tree too, so a screen reader never meets its controls while it closes', () => {
    expect(byId('panel').getAttribute('aria-hidden')).toBe('true');
  });

  it('when it opens, then it is back in the accessibility tree at once', async () => {
    fixture.componentInstance.closed.set(false);
    await settle();

    expect(byId('panel').hasAttribute('aria-hidden')).toBe(false);
  });

  it('when it opens, then it is shown and stops being inert at once, so its content can take the focus', async () => {
    fixture.componentInstance.closed.set(false);
    await settle();

    expect(byId('panel').hidden).toBe(false);
    expect(byId('panel').hasAttribute('inert')).toBe(false);
  });

  it('when its toggle closes it, then it turns inert in the same update in which aria-expanded turns false', async () => {
    fixture.componentInstance.closed.set(false);
    await settle();

    byId('toggle').click();
    fixture.detectChanges();

    expect(byId('toggle').getAttribute('aria-expanded')).toBe('false');
    expect(byId('panel').hasAttribute('inert')).toBe(true);
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
    expect(question.getAttribute('aria-hidden')).toBe('true');
  });

  describe('when it opens while its height unfolds', () => {
    let unfold: () => void;
    let unfolding: Promise<void>;

    beforeEach(() => {
      unfolding = new Promise<void>((resolve) => (unfold = resolve));
      byId('panel').getAnimations = () =>
        [
          { transitionProperty: 'opacity', finished: new Promise(() => undefined) },
          { transitionProperty: 'grid-template-rows', finished: unfolding },
        ] as never;
    });

    it('then it says it has unfolded only once its height has finished unfolding', async () => {
      fixture.componentInstance.closed.set(false);
      await settle();

      expect(fixture.componentInstance.unfoldings()).toBe(0);

      unfold();
      await settle();

      expect(fixture.componentInstance.unfoldings()).toBe(1);
    });

    it('and closes before its height has unfolded, then it never says it has unfolded', async () => {
      fixture.componentInstance.closed.set(false);
      await settle();
      fixture.componentInstance.closed.set(true);
      await settle();

      unfold();
      await settle();

      expect(fixture.componentInstance.unfoldings()).toBe(0);
    });

    it('and its height transition is cancelled, then it still says it has unfolded once and stays open', async () => {
      let cancel: (reason: unknown) => void = () => undefined;
      const cancelled = new Promise<void>((_, reject) => (cancel = reject));
      byId('panel').getAnimations = () =>
        [{ transitionProperty: 'grid-template-rows', finished: cancelled }] as never;

      fixture.componentInstance.closed.set(false);
      await settle();
      cancel(new DOMException('', 'AbortError'));
      await settle();

      expect(fixture.componentInstance.unfoldings()).toBe(1);
      expect(byId('panel').hidden).toBe(false);
      expect(byId('panel').hasAttribute('inert')).toBe(false);
      expect(byId('panel').hasAttribute('aria-hidden')).toBe(false);
    });

    it('and it is destroyed before its height has unfolded, then it never says it has unfolded, not even to its destroyed output', async () => {
      const warning = vi.spyOn(console, 'warn');
      fixture.componentInstance.closed.set(false);
      await settle();
      fixture.destroy();

      unfold();
      await unfolding;
      await Promise.resolve();

      expect(fixture.componentInstance.unfoldings()).toBe(0);
      expect(warning).not.toHaveBeenCalled();
    });

    it('and closes and opens again before its first height has unfolded, then it says it has unfolded only once, for the new opening', async () => {
      const unfolds: (() => void)[] = [];
      byId('panel').getAnimations = () =>
        [
          {
            transitionProperty: 'grid-template-rows',
            finished: new Promise<void>((resolve) => unfolds.push(resolve)),
          },
        ] as never;

      fixture.componentInstance.closed.set(false);
      await settle();
      fixture.componentInstance.closed.set(true);
      await settle();
      fixture.componentInstance.closed.set(false);
      await settle();

      unfolds[0]();
      await settle();

      expect(unfolds).toHaveLength(2);
      expect(fixture.componentInstance.unfoldings()).toBe(0);

      unfolds[1]();
      await settle();

      expect(fixture.componentInstance.unfoldings()).toBe(1);
    });
  });

  it('when it opens with no height to unfold, then it says it has unfolded at once', async () => {
    byId('panel').getAnimations = () => [];

    fixture.componentInstance.closed.set(false);
    await settle();

    expect(fixture.componentInstance.unfoldings()).toBe(1);
  });

  it('when it is first shown open, then it says nothing, since nothing has unfolded', async () => {
    fixture = TestBed.createComponent(DisclosureHost);
    fixture.componentInstance.closed.set(false);
    await settle();

    expect(fixture.componentInstance.unfoldings()).toBe(0);
  });
});
