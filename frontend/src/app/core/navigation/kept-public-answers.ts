import {
  HttpContext,
  HttpContextToken,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, finalize, Observable, of, share, tap } from 'rxjs';
import { ShownAnswers } from '../connectivity/shown-answers';

export const ASKED_AHEAD = new HttpContextToken<boolean>(() => false);
export const KEPT_ANSWER_MAX_AGE_MS = 10 * 60 * 1000;
export const KEPT_ANSWERS_LIMIT = 50;

const PUBLIC_CONTENT = [
  /^\/api\/content\/home$/,
  /^\/api\/content\/(?:news|projects)(?:\?[^/]*)?$/,
  /^\/api\/content\/(?:news|projects)\/[^/?]+$/,
];
const CONTENT_WRITES = /^\/api\/admin\/content\//;

interface KeptAnswer {
  readonly response: HttpResponse<unknown>;
  readonly keptAt: number;
  readonly receivedAt: number;
}

export function isKeptPublicAnswer(request: HttpRequest<unknown>): boolean {
  return (
    request.method === 'GET' &&
    request.responseType === 'json' &&
    PUBLIC_CONTENT.some((content) => content.test(request.urlWithParams))
  );
}

@Injectable({ providedIn: 'root' })
export class KeptPublicAnswers {
  private readonly answers = new Map<string, KeptAnswer>();
  private readonly refreshing = new Set<string>();
  private readonly onTheirWay = new Map<string, Observable<HttpEvent<unknown>>>();
  private readonly shown = inject(ShownAnswers);

  answer(request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    const key = request.urlWithParams;
    const kept = this.answers.get(key);
    if (kept === undefined || this.tooOld(kept)) {
      return this.sharedFromServer(key, request, next);
    }
    this.shown.record(key, kept.response.headers, kept.receivedAt);
    this.refresh(key, request, next);
    return of(kept.response.clone({ body: structuredClone(kept.response.body) }));
  }

  ahead(request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    const key = request.urlWithParams;
    const kept = this.answers.get(key);
    if ((kept !== undefined && !this.tooOld(kept)) || this.onTheirWay.has(key)) {
      return EMPTY;
    }
    return this.sharedFromServer(key, request, next);
  }

  forget(): void {
    this.answers.clear();
  }

  private refresh(key: string, request: HttpRequest<unknown>, next: HttpHandlerFn): void {
    if (this.refreshing.has(key)) {
      return;
    }
    this.refreshing.add(key);
    this.fromServer(key, request, next)
      .pipe(finalize(() => this.refreshing.delete(key)))
      .subscribe({ error: () => undefined });
  }

  private tooOld(kept: KeptAnswer): boolean {
    return performance.now() - kept.keptAt > KEPT_ANSWER_MAX_AGE_MS;
  }

  private sharedFromServer(
    key: string,
    request: HttpRequest<unknown>,
    next: HttpHandlerFn,
  ): Observable<HttpEvent<unknown>> {
    const running = this.onTheirWay.get(key);
    if (running !== undefined) {
      return running;
    }
    const shared = this.fromServer(key, request, next).pipe(
      finalize(() => this.onTheirWay.delete(key)),
      share(),
    );
    this.onTheirWay.set(key, shared);
    return shared;
  }

  private fromServer(
    key: string,
    request: HttpRequest<unknown>,
    next: HttpHandlerFn,
  ): Observable<HttpEvent<unknown>> {
    return next(request).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            this.keep(key, event);
          }
        },
        error: (failure: unknown) => {
          if (isGone(failure)) {
            this.answers.delete(key);
          }
        },
      }),
    );
  }

  private keep(key: string, response: HttpResponse<unknown>): void {
    this.answers.delete(key);
    this.answers.set(key, {
      response: response.clone({ body: structuredClone(response.body) }),
      keptAt: performance.now(),
      receivedAt: Date.now(),
    });
    for (const oldest of this.answers.keys()) {
      if (this.answers.size <= KEPT_ANSWERS_LIMIT) {
        break;
      }
      this.answers.delete(oldest);
    }
  }
}

export const keptPublicAnswersInterceptor: HttpInterceptorFn = (request, next) => {
  const kept = inject(KeptPublicAnswers);
  if (request.method !== 'GET' && CONTENT_WRITES.test(request.url)) {
    return next(request).pipe(finalize(() => kept.forget()));
  }
  if (!isKeptPublicAnswer(request)) {
    return next(request);
  }
  return request.context.get(ASKED_AHEAD) ? kept.ahead(request, next) : kept.answer(request, next);
};

function isGone(failure: unknown): boolean {
  return typeof failure === 'object' && failure !== null && 'status' in failure
    ? failure.status === 404
    : false;
}

export function askedAhead(): HttpContext {
  return new HttpContext().set(ASKED_AHEAD, true);
}
