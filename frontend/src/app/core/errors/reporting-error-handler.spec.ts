import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ErrorReporter } from './error-reporter';
import { ReportingErrorHandler } from './reporting-error-handler';

describe('Given the reporting error handler', () => {
  let report: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let handler: ErrorHandler;

  beforeEach(() => {
    report = vi.fn();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ErrorReporter, useValue: { report } },
        { provide: ErrorHandler, useClass: ReportingErrorHandler },
      ],
    });
    handler = TestBed.inject(ErrorHandler);
  });

  afterEach(() => consoleError.mockRestore());

  describe('when an error escapes the application', () => {
    const error = new Error('Zxqv Kanárek 7781,77 Kč 2099-778177');

    beforeEach(() => handler.handleError(error));

    it('then it still reaches the console as before', () => {
      expect(consoleError).toHaveBeenCalled();
    });

    it('then it is reported as unexpected at the global place', () => {
      expect(report).toHaveBeenCalledExactlyOnceWith('unexpected', 'global', error);
    });
  });

  it('when the reporter itself fails, then the handler still returns', () => {
    report.mockImplementation(() => {
      throw new Error('broken');
    });

    expect(() => handler.handleError(new Error('x'))).not.toThrow();
  });
});
