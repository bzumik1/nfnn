import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveNotice, Notice } from './live-notice';

@Component({
  imports: [LiveNotice],
  template: `<app-live-notice [notice]="notice()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly notice = signal<Notice | null>(null);
}

describe('Given a page with a live notice', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  function region(role: 'status' | 'alert'): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[role="${role}"]`);
  }

  it('when nothing has happened yet, then both live regions are already there and empty', () => {
    expect(region('status')?.textContent?.trim()).toBe('');
    expect(region('alert')?.textContent?.trim()).toBe('');
  });

  it('when a status arrives, then its text fills the status region in place', async () => {
    const statusRegion = region('status');

    fixture.componentInstance.notice.set({ kind: 'status', text: 'Uloženo.' });
    await fixture.whenStable();

    expect(region('status')).toBe(statusRegion);
    expect(region('status')?.textContent?.trim()).toBe('Uloženo.');
    expect(region('alert')?.textContent?.trim()).toBe('');
  });

  it('when an alert follows, then the status empties and the alert region carries the text', async () => {
    fixture.componentInstance.notice.set({ kind: 'status', text: 'Uloženo.' });
    await fixture.whenStable();

    fixture.componentInstance.notice.set({ kind: 'alert', text: 'Nepovedlo se.' });
    await fixture.whenStable();

    expect(region('status')?.textContent?.trim()).toBe('');
    expect(region('alert')?.textContent?.trim()).toBe('Nepovedlo se.');
  });
});

@Component({
  imports: [LiveNotice],
  template: `<app-live-notice look="footer" [notice]="notice()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CardHost {
  readonly notice = signal<Notice | null>(null);
}

describe('Given a live notice under the rows of a card', () => {
  let fixture: ComponentFixture<CardHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(CardHost);
    await fixture.whenStable();
  });

  it('when nothing has happened yet, then no footer line takes room in the card', () => {
    expect(fixture.nativeElement.querySelector('.ui-card__footer')).toBeNull();
  });

  it('when a status arrives, then it reads as a footer line of the card inside the status region', async () => {
    fixture.componentInstance.notice.set({ kind: 'status', text: 'Uloženo.' });
    await fixture.whenStable();

    const line = fixture.nativeElement.querySelector('[role="status"] > p');
    expect(line?.textContent?.trim()).toBe('Uloženo.');
    expect(line?.classList).toContain('ui-card__footer');
    expect(line?.classList).toContain('ui-card__footer--status');
  });

  it('when an alert arrives, then it reads as a footer line of the card inside the alert region', async () => {
    fixture.componentInstance.notice.set({ kind: 'alert', text: 'Nepovedlo se.' });
    await fixture.whenStable();

    const line = fixture.nativeElement.querySelector('[role="alert"] > p');
    expect(line?.textContent?.trim()).toBe('Nepovedlo se.');
    expect(line?.classList).toContain('ui-card__footer');
    expect(line?.classList).toContain('ui-card__footer--alert');
  });
});
