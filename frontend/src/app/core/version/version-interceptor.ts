import { HttpInterceptorFn } from '@angular/common/http';

export const UPDATE_REQUIRED = 'app/update-required';

export const versionInterceptor: HttpInterceptorFn = (request, next) => next(request);
