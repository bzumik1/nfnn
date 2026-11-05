import {
  HttpErrorResponse,
  HttpEventType,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';

import { APP_REVISION } from '../errors/app-revision';
import { APP_REVISION_HEADER, ServerVersion } from './server-version';

export const UPDATE_REQUIRED = 'app/update-required';

const API_PATH = '/api/';
const READING_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_KEEPING_PATHS = new Set(['/api/donors/auth/refresh', '/api/donors/auth/logout']);
const UPGRADE_REQUIRED = 426;

export const versionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_PATH)) {
    return next(request);
  }
  const version = inject(ServerVersion);
  if (version.mustUpdate() && changesData(request)) {
    return throwError(() => updateRequired(request));
  }
  return next(request.clone({ setHeaders: { [APP_REVISION_HEADER]: APP_REVISION } })).pipe(
    tap((event) => {
      if (event.type === HttpEventType.ResponseHeader || event.type === HttpEventType.Response) {
        version.observe(event.headers);
      }
    }),
    catchError((failure: unknown) => {
      if (failure instanceof HttpErrorResponse && failure.status !== 0) {
        version.observe(failure.headers);
      }
      return throwError(() => failure);
    }),
  );
};

function changesData(request: HttpRequest<unknown>): boolean {
  return (
    !READING_METHODS.has(request.method.toUpperCase()) &&
    !SESSION_KEEPING_PATHS.has(request.url.split(/[?#]/)[0])
  );
}

function updateRequired(request: HttpRequest<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: UPGRADE_REQUIRED,
    statusText: 'Upgrade Required',
    url: request.url,
    error: {
      type: `https://nfnn.cz/problems/${UPDATE_REQUIRED}`,
      status: UPGRADE_REQUIRED,
      title: $localize`:@@layout.update.problem.title:Web mezitím dostal novou verzi`,
      detail: $localize`:@@layout.update.problem.detail:Nic jsme neodeslali. Načtěte stránku znovu a zkuste to ještě jednou.`,
    },
  });
}
