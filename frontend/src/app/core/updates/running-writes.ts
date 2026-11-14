import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { RunningWork } from './running-work';

const API_PATH = '/api/';
const READING_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const runningWritesInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_PATH) || READING_METHODS.has(request.method.toUpperCase())) {
    return next(request);
  }
  return inject(RunningWork).during(next(request));
};
