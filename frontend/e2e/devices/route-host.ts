import type { Request, Route } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { SESSION_FLAG } from './ui';
import type { RouteTarget } from '../fixtures';

type UrlMatcher = string | RegExp | ((url: URL) => boolean);
type Handler = (route: Route, request: Request) => unknown;

interface Answer {
  status?: number;
  json?: unknown;
  body?: string | Buffer;
  contentType?: string;
  headers?: Record<string, string>;
}

interface PageState {
  textScale: number;
  rememberedSession: boolean;
}

export const BLANK_PATH = '/__blank';
export const ERRORS_GLOBAL = '__deviceErrors';
export const EVENTS_GLOBAL = '__deviceEvents';
const LOGGED_EVENTS = [
  'pointerdown',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchend',
  'touchcancel',
  'mousedown',
  'mouseup',
  'click',
  'focusin',
  'focusout',
];

const FILE_ONLY =
  /\.(?:js|mjs|css|map|json|webmanifest|txt|xml|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|pdf)$/i;
const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  let inGroup = false;
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*';
      index++;
    } else if (char === '*') {
      pattern += '[^/]*';
    } else if (char === '{') {
      inGroup = true;
      pattern += '(?:';
    } else if (char === '}') {
      inGroup = false;
      pattern += ')';
    } else if (char === ',' && inGroup) {
      pattern += '|';
    } else {
      pattern += char.replace(/[\\^$+?.()|[\]]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

function matcherOf(matcher: UrlMatcher): (url: URL) => boolean {
  if (typeof matcher === 'function') {
    return matcher;
  }
  const pattern = typeof matcher === 'string' ? globToRegExp(matcher) : matcher;
  return (url) => pattern.test(url.href);
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((done, failed) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => done(Buffer.concat(chunks)));
    request.on('error', failed);
  });
}

function pageScript(page: PageState): string {
  const session = page.rememberedSession
    ? `localStorage.setItem(${JSON.stringify(SESSION_FLAG)}, '1');`
    : '';
  return `<script>window.${ERRORS_GLOBAL} = [];
addEventListener('error', (event) => window.${ERRORS_GLOBAL}.push(String(event.message)));
addEventListener('unhandledrejection', (event) => window.${ERRORS_GLOBAL}.push(String(event.reason && event.reason.message || event.reason)));
window.${EVENTS_GLOBAL} = [];
for (const type of ${JSON.stringify(LOGGED_EVENTS)}) {
  addEventListener(type, (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const name = target ? target.tagName.toLowerCase() + (target.className && typeof target.className === 'string' ? '.' + target.className.trim().split(/\\s+/).join('.') : '') : String(event.target);
    window.${EVENTS_GLOBAL}.push(Math.round(performance.now()) + ' ' + type + ' ' + name);
  }, true);
}
${session}</script>`;
}

export class RouteHost {
  private readonly server: Server;
  private readonly root: string;
  private readonly appShell: string;
  private handlers: { matches: (url: URL) => boolean; handler: Handler }[] = [];
  private open = 0;
  private answers: string[] = [];
  private page: PageState = { textScale: 100, rememberedSession: false };

  readonly routes: RouteTarget = {
    route: async (matcher: UrlMatcher, handler: Handler) => {
      this.handlers.push({ matches: matcherOf(matcher), handler });
    },
  } as unknown as RouteTarget;

  constructor(folder: string) {
    this.root = resolve(folder);
    this.appShell = join(this.root, 'index.html');
    if (!statSync(this.appShell, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${this.appShell} is missing: build the app first (npm run build)`);
    }
    this.server = createServer((request, response) => {
      response.shouldKeepAlive = false;
      this.open++;
      response.on('close', () => this.open--);
      response.on('finish', () => this.keepAnswer(request, response));
      this.answer(request, response).catch((error: unknown) => {
        if (!response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        response.end(String(error));
      });
    });
  }

  async start(): Promise<string> {
    await new Promise<void>((done) => this.server.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise((done) => this.server.close(() => done()));
  }

  reset(textScale: number): void {
    this.handlers = [];
    this.answers = [];
    this.page = { textScale, rememberedSession: false };
  }

  rememberSession(): void {
    this.page.rememberedSession = true;
  }

  inFlight(): number {
    return this.open;
  }

  answered(): string[] {
    return [...this.answers];
  }

  private keepAnswer(request: IncomingMessage, response: ServerResponse): void {
    const { pathname } = new URL(request.url ?? '/', 'http://host');
    if (pathname.startsWith('/api/')) {
      this.answers.push(`${request.method ?? 'GET'} ${pathname} ${response.statusCode}`);
    }
  }

  private async answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const body = await readBody(request);
    for (const { matches, handler } of [...this.handlers].reverse()) {
      if (!matches(url)) {
        continue;
      }
      const decision = await this.ask(handler, url, request, body);
      if (decision === 'fallback') {
        continue;
      }
      if (decision === 'abort') {
        response.destroy();
        return;
      }
      if (decision !== 'continue') {
        this.send(response, decision);
        return;
      }
      break;
    }
    this.serveFile(url.pathname, request.method ?? 'GET', response);
  }

  private ask(
    handler: Handler,
    url: URL,
    request: IncomingMessage,
    body: Buffer,
  ): Promise<Answer | 'fallback' | 'abort' | 'continue'> {
    return new Promise((decide, failed) => {
      const asked = {
        url: () => url.href,
        method: () => request.method ?? 'GET',
        headers: () => request.headers,
        postData: () => (body.length ? body.toString('utf8') : null),
        postDataJSON: () => (body.length ? JSON.parse(body.toString('utf8')) : null),
      };
      const route = {
        request: () => asked,
        fulfill: async (answer: Answer = {}) => decide(answer),
        fallback: async () => decide('fallback'),
        continue: async () => decide('continue'),
        abort: async () => decide('abort'),
      };
      Promise.resolve(handler(route as unknown as Route, asked as unknown as Request)).catch(
        failed,
      );
    });
  }

  private send(response: ServerResponse, answer: Answer): void {
    const body =
      answer.json !== undefined ? JSON.stringify(answer.json) : (answer.body ?? Buffer.alloc(0));
    const contentType =
      answer.contentType ?? (answer.json !== undefined ? 'application/json' : undefined);
    response.writeHead(answer.status ?? 200, {
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...answer.headers,
    });
    response.end(body);
  }

  private fileFor(pathname: string): string | null {
    const candidate = resolve(this.root, `.${decodeURIComponent(pathname)}`);
    if (candidate !== this.root && !candidate.startsWith(this.root + sep)) {
      return null;
    }
    const found = statSync(candidate, { throwIfNoEntry: false })?.isFile() ? candidate : null;
    if (found || FILE_ONLY.test(pathname) || /^\/(?:media|images)\//.test(pathname)) {
      return found;
    }
    return this.appShell;
  }

  private serveFile(pathname: string, method: string, response: ServerResponse): void {
    if (pathname === BLANK_PATH) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>blank</title>');
      return;
    }
    const file = this.fileFor(pathname);
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<h1>404 Not Found</h1>');
      return;
    }
    const shell = file === this.appShell;
    const content = shell ? this.shell() : readFileSync(file);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': shell ? 'no-store' : 'no-cache',
    });
    response.end(method === 'HEAD' ? undefined : content);
  }

  private shell(): string {
    const html = readFileSync(this.appShell, 'utf8');
    const scale =
      this.page.textScale === 100
        ? ''
        : `<style>html { font-size: ${this.page.textScale}%; }</style>`;
    return html
      .replace('<head>', `<head>${pageScript(this.page)}`)
      .replace('</head>', `${scale}</head>`);
  }
}
