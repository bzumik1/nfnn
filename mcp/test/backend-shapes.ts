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

export const AUTHORIZATION_CALLS: readonly ConnectorCall[] = [];

export function connectorCalls(sourceDirectory: string): ConnectorCall[] {
  void sourceDirectory;
  return [];
}

export function recordedAnswers(directory: string): RecordedAnswers {
  void directory;
  return new Map();
}

export function declaredAdditions(changesDirectory: string): string[] {
  void changesDirectory;
  return [];
}

export function fakeBackendRequests(
  source: string,
  constants: Readonly<Record<string, string>>,
): FakeRequest[] {
  void source;
  void constants;
  return [];
}

export function askFakeBackend(
  baseUrl: string,
  request: FakeRequest,
  calls: readonly ConnectorCall[],
  recorded: RecordedAnswers,
): Promise<FixtureAnswer> {
  void baseUrl;
  void calls;
  void recorded;
  return Promise.resolve({ method: request.method, path: request.path, status: 0, body: null });
}

export function checkBackendShapes(input: {
  readonly calls: readonly ConnectorCall[];
  readonly recorded: RecordedAnswers;
  readonly fixtures: readonly FixtureAnswer[];
  readonly addedSinceV2?: readonly string[];
}): string[] {
  void input;
  return [];
}
