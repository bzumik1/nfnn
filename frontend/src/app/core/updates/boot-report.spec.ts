import { TestBed } from '@angular/core/testing';

import { ErrorReporter } from '../errors/error-reporter';
import { SESSION_STORAGE } from '../reload/reload-guard';
import {
  BOOT_RECOVERED_KEY,
  BootReport,
  CODE_ARRIVED_ATTRIBUTE,
  markCodeArrived,
  STARTED_ATTRIBUTE,
} from './boot-report';

describe('Given the app has started', () => {
  let report: ReturnType<typeof vi.fn>;

  function bootReportWith(storage: () => Storage): BootReport {
    report = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_STORAGE, useValue: storage },
        { provide: ErrorReporter, useValue: { report } },
      ],
    });
    return TestBed.inject(BootReport);
  }

  beforeEach(() => {
    sessionStorage.clear();
    document.documentElement.removeAttribute(STARTED_ATTRIBUTE);
    document.documentElement.removeAttribute(CODE_ARRIVED_ATTRIBUTE);
  });

  it('when the code of the app has arrived, then the boot watchdog sees it on the document before the start ends', () => {
    markCodeArrived(document);

    expect(document.documentElement.hasAttribute(CODE_ARRIVED_ATTRIBUTE)).toBe(true);
    expect(document.documentElement.hasAttribute(STARTED_ATTRIBUTE)).toBe(false);
  });

  it('when the start is marked, then the boot watchdog sees it on the document', () => {
    bootReportWith(() => sessionStorage).started();

    expect(document.documentElement.hasAttribute(STARTED_ATTRIBUTE)).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('when the watchdog had to step in before this start, then one boot report is sent and the mark is gone', () => {
    sessionStorage.setItem(BOOT_RECOVERED_KEY, '1');
    const boot = bootReportWith(() => sessionStorage);

    boot.started();
    boot.started();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('boot', 'start-up');
    expect(sessionStorage.getItem(BOOT_RECOVERED_KEY)).toBeNull();
  });

  it('when the session storage is refused, then the start is still marked and nothing is reported', () => {
    bootReportWith(() => {
      throw new Error('SecurityError');
    }).started();

    expect(document.documentElement.hasAttribute(STARTED_ATTRIBUTE)).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });
});
