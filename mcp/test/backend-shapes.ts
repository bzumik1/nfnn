import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface ConnectorCall {
  readonly method: string;
  readonly template: string;
  readonly source: string;
  readonly accept: string;
  readonly photo: boolean;
}

export interface RecordedAnswer {
  readonly status: number;
  readonly body: unknown;
  readonly requestBody: unknown;
}

export type RecordedAnswers = ReadonlyMap<string, readonly RecordedAnswer[]>;

export interface FakeRequest {
  readonly method: string;
  readonly path: string;
  readonly contentType?: string;
  readonly body?: string;
}

export interface FixtureAnswer {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
}

type Kind = 'null' | 'string' | 'number' | 'boolean' | 'object' | 'array';

interface Shape {
  readonly kinds: Set<Kind>;
  readonly fields: Map<string, Shape>;
  items: Shape | undefined;
}

export const AUTHORIZATION_CALLS: readonly ConnectorCall[] = [
  {
    method: 'GET',
    template: '/.well-known/oauth-authorization-server',
    source: 'src/authorization.ts (METADATA_PATH)',
    accept: 'application/json',
    photo: false,
  },
  {
    method: 'POST',
    template: '/api/donors/oauth/token',
    source: 'src/token-exchange.ts (the token_endpoint of the metadata)',
    accept: 'application/json',
    photo: false,
  },
];

const CALL = /\bbackend\s*\.\s*(get|getText|post|put|delete|postPhoto)\s*\(\s*/g;
const METHODS: Record<string, string> = {
  get: 'GET',
  getText: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  postPhoto: 'POST',
};
const HOLE = '\u0000';
const SHAPE_ONLY: Record<string, Kind> = {
  '<number>': 'number',
  '<boolean>': 'boolean',
  '<string>': 'string',
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : name.endsWith('.ts') ? [path] : [];
    })
    .sort();
}

function literalAt(text: string, start: number): string | undefined {
  const quote = text[start];
  if (quote === "'" || quote === '"') {
    const end = text.indexOf(quote, start + 1);
    return end < 0 ? undefined : text.slice(start + 1, end);
  }
  if (quote !== '`') {
    return undefined;
  }
  let literal = '';
  let index = start + 1;
  while (index < text.length && text[index] !== '`') {
    if (text[index] === '$' && text[index + 1] === '{') {
      index = interpolationEnd(text, index + 2);
      literal += HOLE;
    } else {
      literal += text[index];
      index += 1;
    }
  }
  return literal;
}

function interpolationEnd(text: string, start: number): number {
  let depth = 1;
  let index = start;
  while (index < text.length && depth > 0) {
    const char = text[index];
    if (char === '`') {
      index = templateEnd(text, index + 1);
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    }
    index += 1;
  }
  return index;
}

function templateEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length && text[index] !== '`') {
    index =
      text[index] === '$' && text[index + 1] === '{'
        ? interpolationEnd(text, index + 2)
        : index + 1;
  }
  return index + 1;
}

function pathTemplate(literal: string): string {
  const path = literal.split('?')[0] ?? '';
  return path
    .split('/')
    .map((segment) => (segment.startsWith(HOLE) ? '{}' : (segment.split(HOLE)[0] ?? '')))
    .join('/');
}

export function connectorCalls(sourceDirectory: string): ConnectorCall[] {
  const calls: ConnectorCall[] = [];
  for (const file of sourceFiles(sourceDirectory)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(CALL)) {
      const literal = literalAt(text, match.index + match[0].length);
      const method = match[1] ?? '';
      if (literal === undefined) {
        continue;
      }
      calls.push({
        method: METHODS[method] ?? method,
        template: pathTemplate(literal),
        source: `${relative(sourceDirectory, file).split(sep).join('/')}:${text.slice(0, match.index).split('\n').length}`,
        accept: method === 'getText' ? 'text/plain' : 'application/json',
        photo: method === 'postPhoto',
      });
    }
  }
  return calls;
}

function jsonFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith('.json') ? [path] : [];
    })
    .sort();
}

interface TranscriptFile {
  readonly scenarios?: Record<
    string,
    {
      readonly requests?: Record<
        string,
        {
          readonly request?: { readonly body?: unknown };
          readonly response?: { readonly status: number; readonly body?: unknown };
        }
      >;
    }
  >;
}

export function recordedAnswers(directory: string): RecordedAnswers {
  if (!existsSync(directory)) {
    throw new Error(
      `${directory} does not exist; record it with API_TRANSCRIPTS=record (.claude/rules/testing.md, "Regression against v2")`,
    );
  }
  const answers = new Map<string, RecordedAnswer[]>();
  for (const file of jsonFiles(directory)) {
    const transcript = JSON.parse(readFileSync(file, 'utf8')) as TranscriptFile;
    for (const scenario of Object.values(transcript.scenarios ?? {})) {
      for (const [key, call] of Object.entries(scenario.requests ?? {})) {
        const request = key.replace(/ #\d+$/, '');
        const list = answers.get(request) ?? [];
        list.push({
          status: call.response?.status ?? 0,
          body: call.response?.body,
          requestBody: call.request?.body,
        });
        answers.set(request, list);
      }
    }
  }
  return answers;
}

export function declaredAdditions(changesDirectory: string): string[] {
  if (!existsSync(changesDirectory)) {
    return [];
  }
  return readdirSync(changesDirectory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => JSON.parse(readFileSync(join(changesDirectory, name), 'utf8')) as unknown[])
    .filter(
      (entry): entry is { kind: string; path: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { kind?: unknown }).kind === 'added' &&
        typeof (entry as { path?: unknown }).path === 'string',
    )
    .map((entry) => entry.path);
}

export function fakeBackendRequests(
  source: string,
  constants: Readonly<Record<string, string>>,
): FakeRequest[] {
  return [...source.matchAll(/case\s+(['`])((?:GET|POST|PUT|PATCH|DELETE) [^'`]+)\1\s*:/g)].map(
    (match) => {
      const label = (match[2] ?? '').replace(/\$\{(\w+)\}/g, (hole, name: string) => {
        const value = constants[name];
        if (value === undefined) {
          throw new Error(
            `the fake backend's case ${match[2]} uses ${hole}, which it does not export`,
          );
        }
        return value;
      });
      const [method = '', ...path] = label.split(' ');
      return { method, path: path.join(' ') };
    },
  );
}

const segments = (path: string) => path.split('?')[0]?.split('/') ?? [];

function literalCount(template: string): number {
  return segments(template).filter((segment) => segment !== '{}').length;
}

function matches(call: ConnectorCall, method: string, path: string): boolean {
  if (call.method !== method) {
    return false;
  }
  const wanted = segments(call.template);
  const given = segments(path);
  return (
    wanted.length === given.length &&
    wanted.every((segment, index) => segment === '{}' || segment === given[index])
  );
}

function callFor(
  calls: readonly ConnectorCall[],
  method: string,
  path: string,
): ConnectorCall | undefined {
  return calls
    .filter((call) => matches(call, method, path))
    .sort((one, other) => literalCount(other.template) - literalCount(one.template))[0];
}

function decodedPath(path: string): string {
  return segments(path)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

function answersOf(
  call: ConnectorCall,
  calls: readonly ConnectorCall[],
  recorded: RecordedAnswers,
): RecordedAnswer[] {
  return [...recorded].flatMap(([request, answers]) => {
    const [method = '', ...rest] = request.split(' ');
    const path = rest.join(' ');
    return callFor(calls, method, path) === call ? answers : [];
  });
}

export async function askFakeBackend(
  baseUrl: string,
  request: FakeRequest,
  calls: readonly ConnectorCall[],
  recorded: RecordedAnswers,
): Promise<FixtureAnswer> {
  const call = callFor(calls, request.method, decodedPath(request.path));
  const headers: Record<string, string> = {
    accept: call?.accept ?? 'application/json',
    authorization: 'Bearer api-token-write',
  };
  let body: string | FormData | undefined = request.body;
  if (request.contentType !== undefined) {
    headers['content-type'] = request.contentType;
  } else if (call?.photo) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'photo');
    body = form;
  } else if (request.method !== 'GET' && request.method !== 'DELETE' && call !== undefined) {
    const sent = answersOf(call, calls, recorded).find(
      (answer) => answer.status < 300 && answer.requestBody !== undefined,
    )?.requestBody;
    headers['content-type'] = 'application/json';
    body = JSON.stringify(sent ?? {});
  }
  const response = await fetch(baseUrl + request.path, { method: request.method, headers, body });
  const text = await response.text();
  return {
    method: request.method,
    path: request.path,
    status: response.status,
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}

function kindOf(value: unknown): Kind {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'string') {
    return SHAPE_ONLY[value] ?? 'string';
  }
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'object'
    ? (typeof value as Kind)
    : 'string';
}

function emptyShape(): Shape {
  return { kinds: new Set(), fields: new Map(), items: undefined };
}

function widen(shape: Shape, value: unknown): void {
  const kind = kindOf(value);
  shape.kinds.add(kind);
  if (kind === 'object') {
    for (const [field, inner] of Object.entries(value as Record<string, unknown>)) {
      const fieldShape = shape.fields.get(field) ?? emptyShape();
      widen(fieldShape, inner);
      shape.fields.set(field, fieldShape);
    }
  } else if (kind === 'array') {
    for (const item of value as unknown[]) {
      shape.items ??= emptyShape();
      widen(shape.items, item);
    }
  }
}

interface Mismatch {
  readonly path: string;
  readonly kind?: Kind;
  readonly recorded?: readonly Kind[];
}

function mismatches(value: unknown, shape: Shape, path: string, out: Mismatch[]): void {
  const kind = kindOf(value);
  if (shape.kinds.size === 1 && shape.kinds.has('null')) {
    return;
  }
  if (!shape.kinds.has(kind)) {
    out.push({ path, kind, recorded: [...shape.kinds].sort() });
    return;
  }
  if (kind === 'object') {
    for (const [field, inner] of Object.entries(value as Record<string, unknown>)) {
      const fieldShape = shape.fields.get(field);
      if (fieldShape === undefined) {
        out.push({ path: `${path}.${field}` });
      } else {
        mismatches(inner, fieldShape, `${path}.${field}`, out);
      }
    }
  } else if (kind === 'array' && shape.items !== undefined) {
    (value as unknown[]).forEach((item, index) =>
      mismatches(item, shape.items as Shape, `${path}[${index}]`, out),
    );
  }
}

export function checkBackendShapes(input: {
  readonly calls: readonly ConnectorCall[];
  readonly recorded: RecordedAnswers;
  readonly fixtures: readonly FixtureAnswer[];
  readonly addedSinceV2?: readonly string[];
}): string[] {
  const { calls, recorded, fixtures } = input;
  const added = new Set(input.addedSinceV2 ?? []);
  const problems: string[] = [];
  const unique = calls.filter(
    (call, index) =>
      calls.findIndex(
        (other) => other.method === call.method && other.template === call.template,
      ) === index,
  );
  for (const call of unique) {
    const name = `${call.method} ${call.template}`;
    if (answersOf(call, unique, recorded).length === 0 && !added.has(name)) {
      problems.push(
        `${name} (${call.source}) is called by the connector, but no transcript records it`,
      );
    }
  }
  for (const fixture of fixtures) {
    const call = callFor(unique, fixture.method, decodedPath(fixture.path));
    const request = `${fixture.method} ${fixture.path}`;
    if (call === undefined) {
      problems.push(`the fake serves ${request}, which the connector never calls`);
      continue;
    }
    const name = `${call.method} ${call.template}`;
    const answers = answersOf(call, unique, recorded);
    if (answers.length === 0) {
      continue;
    }
    const sameStatus = answers.filter((answer) => answer.status === fixture.status);
    if (sameStatus.length === 0) {
      const statuses = [...new Set(answers.map((answer) => answer.status))].sort();
      problems.push(
        `the fake answers ${request} with ${fixture.status}, but the transcripts of ${name} record only ${statuses.join(', ')}`,
      );
      continue;
    }
    if (fixture.body === undefined) {
      continue;
    }
    const shape = emptyShape();
    sameStatus.forEach((answer) => widen(shape, answer.body ?? null));
    const found: Mismatch[] = [];
    mismatches(fixture.body, shape, '$', found);
    for (const { path, kind, recorded: kinds } of found) {
      problems.push(
        `the fake's ${fixture.status} answer to ${request} has ${path}${
          kind === undefined
            ? `, which no recorded answer of ${name} has`
            : ` as ${kind}, recorded only as ${(kinds ?? []).join(' or ')}`
        }`,
      );
    }
  }
  return problems;
}
