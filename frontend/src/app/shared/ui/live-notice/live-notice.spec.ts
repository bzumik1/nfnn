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
