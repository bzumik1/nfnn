import {
  HttpContextToken,
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
const SESSION_ENDED = 'auth/session-ended';
const PROBLEM_MEDIA_TYPE = 'application/problem+json';

export const WITHOUT_ACCESS_TOKEN = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!needsAccessToken(request.url)) {
    return next(request);
  }
  if (request.context.get(WITHOUT_ACCESS_TOKEN)) {
    return send(request, next);
  }
  const store = inject(AuthStore);
  const token = store.currentAccessToken();
  if (token === null) {
    return send(request, next);
  }
  return send(withBearer(request, token), next).pipe(
    catchError((failure: unknown) => {
      const ended = problemTypeEndsWith(failure, SESSION_ENDED);
      if (!ended && !problemTypeEndsWith(failure, EXPIRED_TOKEN)) {
        return throwError(() => failure);
      }
      if (ended) {
        store.sessionEnded();
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
  if (!(failure instanceof HttpErrorResponse)) {
    return of(failure);
  }
  if (isProblemText(failure)) {
    return of(parsedOrAsIs(failure, failure.error));
  }
  if (!isProblemBlob(failure.error)) {
    return of(failure);
  }
  return from(failure.error.text()).pipe(
    map((text) => parsedOrAsIs(failure, text)),
    catchError(() => of(failure)),
  );
}

function parsedOrAsIs(failure: HttpErrorResponse, text: string): HttpErrorResponse {
  try {
    return new HttpErrorResponse({
      error: JSON.parse(text) as unknown,
      headers: failure.headers,
      status: failure.status,
      statusText: failure.statusText,
      url: failure.url ?? undefined,
    });
  } catch {
    return failure;
  }
}

function isProblemText(
  failure: HttpErrorResponse,
): failure is HttpErrorResponse & { error: string } {
  return typeof failure.error === 'string' && isProblemType(failure.headers.get('Content-Type'));
}

function isProblemBlob(body: unknown): body is Blob {
  return body instanceof Blob && isProblemType(body.type);
}

function isProblemType(contentType: string | null): boolean {
  return (contentType ?? '').split(';')[0].trim().toLowerCase() === PROBLEM_MEDIA_TYPE;
}

function needsAccessToken(url: string): boolean {
  return url.startsWith('/api/') && !url.startsWith('/api/donors/auth/');
}

function withBearer<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
