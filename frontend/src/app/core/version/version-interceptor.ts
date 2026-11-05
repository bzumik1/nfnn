/// <reference types="@angular/localize" />

import {
  HttpErrorResponse,
  HttpEventType,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';

import { APP_REVISION } from '../errors/app-revision';
import { mayComeFromServiceWorker } from '../updates/service-worker-bypass';
import { SERVICE_WORKER_UPDATES } from '../updates/service-worker-updates';
import { POSTS_ACROSS_GENERATIONS } from './api-generation';
import { APP_API_HEADER, APP_REVISION_HEADER, ServerVersion } from './server-version';

export const UPDATE_REQUIRED = 'app/update-required';

const API_PATH = '/api/';
const READING_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UPGRADE_REQUIRED = 426;

export const versionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_PATH)) {
    return next(request);
  }
  const version = inject(ServerVersion);
  const mayBeAKeptCopy =
    inject(SERVICE_WORKER_UPDATES).isEnabled && mayComeFromServiceWorker(request);
  if (version.mustUpdate() && changesData(request)) {
    return throwError(() => updateRequired(request));
  }
  const named = request.clone({
    setHeaders: {
      [APP_REVISION_HEADER]: APP_REVISION,
      [APP_API_HEADER]: String(version.appApiGeneration),
    },
  });
  return next(named).pipe(
    tap((event) => {
      if (
        !mayBeAKeptCopy &&
        (event.type === HttpEventType.ResponseHeader || event.type === HttpEventType.Response)
      ) {
        version.observe(event.headers);
      }
    }),
    catchError((failure: unknown) => {
      if (!mayBeAKeptCopy && failure instanceof HttpErrorResponse && failure.status !== 0) {
        version.observe(failure.headers);
      }
      return throwError(() => failure);
    }),
  );
};

function changesData(request: HttpRequest<unknown>): boolean {
  return (
    !READING_METHODS.has(request.method.toUpperCase()) &&
    !POSTS_ACROSS_GENERATIONS.has(request.url.split(/[?#]/)[0])
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
