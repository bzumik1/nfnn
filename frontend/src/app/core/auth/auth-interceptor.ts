import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { problemTypeEndsWith } from './api-problem';
import { AuthStore } from './auth-store';

const EXPIRED_TOKEN = 'auth/expired-token';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!needsAccessToken(request.url)) {
    return next(request);
  }
  const store = inject(AuthStore);
  const token = store.currentAccessToken();
  if (token === null) {
    return next(request);
  }
  return next(withBearer(request, token)).pipe(
    catchError((failure: unknown) => {
      if (!problemTypeEndsWith(failure, EXPIRED_TOKEN)) {
        return throwError(() => failure);
      }
      return store.refresh().pipe(switchMap((fresh) => next(withBearer(request, fresh))));
    }),
  );
};

function needsAccessToken(url: string): boolean {
  return url.startsWith('/api/') && !url.startsWith('/api/donors/auth/');
}

function withBearer<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
