import { ErrorHandler, inject, Injectable } from '@angular/core';

import { isChunkLoadError } from '../reload/chunk-load-recovery';
import { ErrorReporter } from './error-reporter';

@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly reporter = inject(ErrorReporter);

  override handleError(error: unknown): void {
    super.handleError(error);
    if (isChunkLoadError(error)) {
      return;
    }
    try {
      this.reporter.report('unexpected', 'global', error);
    } catch {
      return;
    }
  }
}
