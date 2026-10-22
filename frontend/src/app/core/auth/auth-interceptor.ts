import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, map, Observable, of, switchMap, throwError } from 'rxjs';
import { problemTypeEndsWith } from './api-problem';
import { AuthStore } from './auth-store';

const EXPIRED_TOKEN = 'auth/expired-token';
const PROBLEM_MEDIA_TYPE = 'application/problem+json';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!needsAccessToken(request.url)) {
    return next(request);
  }
  const store = inject(AuthStore);
  const token = store.currentAccessToken();
  if (token === null) {
    return send(request, next);
  }
  return send(withBearer(request, token), next).pipe(
    catchError((failure: unknown) => {
      if (!problemTypeEndsWith(failure, EXPIRED_TOKEN)) {
        return throwError(() => failure);
      }
      return store.refresh().pipe(switchMap((fresh) => send(withBearer(request, fresh), next)));
    }),
  );
};

function send<T>(request: HttpRequest<T>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  return next(request).pipe(catchError((failure: unknown) => rethrowReadable(failure)));
}

function rethrowReadable(failure: unknown): Observable<never> {
  return readable(failure).pipe(switchMap((reason) => throwError(() => reason)));
}

function readable(failure: unknown): Observable<unknown> {
  if (!(failure instanceof HttpErrorResponse) || !isProblemBlob(failure.error)) {
    return of(failure);
  }
  return from(failure.error.text()).pipe(
    map(
      (text) =>
        new HttpErrorResponse({
          error: JSON.parse(text) as unknown,
          headers: failure.headers,
          status: failure.status,
          statusText: failure.statusText,
          url: failure.url ?? undefined,
        }),
    ),
    catchError(() => of(failure)),
  );
}

function isProblemBlob(body: unknown): body is Blob {
  return (
    body instanceof Blob && body.type.split(';')[0].trim().toLowerCase() === PROBLEM_MEDIA_TYPE
  );
}

function needsAccessToken(url: string): boolean {
  return url.startsWith('/api/') && !url.startsWith('/api/donors/auth/');
}

function withBearer<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
