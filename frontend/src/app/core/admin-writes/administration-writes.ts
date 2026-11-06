import { HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { tap } from 'rxjs';

const ADMINISTRATION = '/api/admin/';
const DEVICE_OF_THE_COPY = '/api/admin/donors/devices/current/';

@Injectable({ providedIn: 'root' })
export class AdministrationWrites {
  private count = 0;

  record(): void {
    this.count += 1;
  }

  made(): number {
    return this.count;
  }
}

export const administrationWritesInterceptor: HttpInterceptorFn = (request, next) => {
  if (
    request.method === 'GET' ||
    !request.url.startsWith(ADMINISTRATION) ||
    request.url.startsWith(DEVICE_OF_THE_COPY)
  ) {
    return next(request);
  }
  const writes = inject(AdministrationWrites);
  return next(request).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        writes.record();
      }
    }),
  );
};
