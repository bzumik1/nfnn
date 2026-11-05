import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';

const API_PATH = '/api/';
const BYPASS_HEADER = 'ngsw-bypass';

const ANSWERS_THE_SAME_FOR_EVERYONE = [
  /^\/api\/content\/home$/,
  /^\/api\/content\/(?:news|projects)(?:\?[^/]*)?$/,
  /^\/api\/content\/(?:news|projects)\/[^/?]+$/,
  /^\/api\/content\/media\/[^/?]+(?:\?[^/]*)?$/,
  /^\/api\/donations\/payment-details$/,
];

export const serviceWorkerBypassInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_PATH) || mayComeFromServiceWorker(request)) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { [BYPASS_HEADER]: 'true' } }));
};

export function mayComeFromServiceWorker(request: HttpRequest<unknown>): boolean {
  return (
    request.method === 'GET' &&
    ANSWERS_THE_SAME_FOR_EVERYONE.some((answer) => answer.test(request.urlWithParams))
  );
}
