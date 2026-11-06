import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdministrationReads } from './administration-reads';
import { CopyAge } from './copy-age';

describe('Given a page of the administration that may show the copy on this device', () => {
  const fromCopyOffline = signal(false);
  const copyTime = signal<string | null>('2026-10-20T10:30:00.000Z');

  beforeEach(() => {
    fromCopyOffline.set(false);
    TestBed.configureTestingModule({
      providers: [{ provide: AdministrationReads, useValue: { fromCopyOffline, copyTime } }],
    });
  });

  function shown(): string {
    const fixture = TestBed.createComponent(CopyAge);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
  }

  it('when the device is online, then nothing is said', () => {
    expect(shown()).toBe('');
  });

  it('when the device is offline, then the page says it shows the copy from the time it was last checked, in Prague time', () => {
    fromCopyOffline.set(true);

    expect(shown()).toBe('Offline · údaje z 20. 10. 2026 12:30 · nemusí být aktuální');
  });
});
