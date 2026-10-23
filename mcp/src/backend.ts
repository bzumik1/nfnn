import type { FetchLike } from './authorization.js';
import type { Photo } from './photos.js';

export interface Problem {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string;
}

export class BackendProblem extends Error {
  constructor(readonly problem: Problem) {
    super(`${problem.status} ${problem.type}: ${problem.title}`);
  }
}

export interface BackendResponse {
  readonly status: number;
  readonly body: unknown;
}

export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetch: FetchLike,
  ) {}

  async get(path: string, apiToken?: string): Promise<unknown> {
    return this.send('GET', path, apiToken);
  }

  async getText(path: string, apiToken: string): Promise<string> {
    return String(await this.send('GET', path, apiToken, undefined, 'text/plain'));
  }

  async post(path: string, apiToken: string, body?: unknown): Promise<unknown> {
    return this.send('POST', path, apiToken, body);
  }

  async put(path: string, apiToken: string, body?: unknown): Promise<unknown> {
    return this.send('PUT', path, apiToken, body);
  }

  async delete(path: string, apiToken: string): Promise<unknown> {
    return this.send('DELETE', path, apiToken);
  }

  async postPhoto(path: string, apiToken: string, photo: Photo): Promise<unknown> {
    const form = new FormData();
    form.append('file', new Blob([photo.bytes], { type: photo.contentType }), 'photo');
    return this.send('POST', path, apiToken, form);
  }

  private async send(
    method: string,
    path: string,
    apiToken?: string,
    body?: unknown,
    accept = 'application/json',
  ): Promise<unknown> {
    const headers: Record<string, string> = { accept, 'accept-language': 'cs' };
    if (apiToken !== undefined) {
      headers['authorization'] = `Bearer ${apiToken}`;
    }
    const init: RequestInit = { method, headers };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await this.fetch(this.baseUrl + path, init);
    const text = await response.text();
    const parsed = text.length === 0 ? null : tryParse(text);
    if (response.ok) {
      return parsed;
    }
    throw new BackendProblem(problemOf(response.status, parsed));
  }
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function problemOf(status: number, body: unknown): Problem {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  return {
    status,
    type:
      typeof record['type'] === 'string'
        ? record['type'].replace('https://nfnn.cz/problems/', '')
        : `http-${status}`,
    title: typeof record['title'] === 'string' ? record['title'] : `HTTP ${status}`,
    detail: typeof record['detail'] === 'string' ? record['detail'] : '',
  };
}
