import { HttpErrorResponse, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { mayComeFromServiceWorker } from '../updates/service-worker-bypass';
import { Connectivity } from './connectivity';
import { ShownAnswers } from './shown-answers';

const API_PATH = '/api/';

export const connectivityInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_PATH)) {
    return next(request);
  }
  const connectivity = inject(Connectivity);
  const shown = inject(ShownAnswers);
  const fromNetwork = !mayComeFromServiceWorker(request);
  let heard = false;
  return next(request).pipe(
    tap({
      next: (event) => {
        if (event.type !== HttpEventType.ResponseHeader && event.type !== HttpEventType.Response) {
          return;
        }
        if (!heard) {
          heard = true;
          connectivity.answered({ status: event.status, headers: event.headers, fromNetwork });
        }
        if (event.type === HttpEventType.Response && event.ok && !fromNetwork) {
          shown.record(request.urlWithParams, event.headers, connectivity.serverNow());
        }
      },
      error: (failure: unknown) => {
        if (failure instanceof HttpErrorResponse && (!heard || failure.status === 0)) {
          connectivity.answered({ status: failure.status, headers: failure.headers, fromNetwork });
        }
      },
    }),
  );
};
