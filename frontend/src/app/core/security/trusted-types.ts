export interface ScriptUrlPolicyRules {
  createScriptURL(input: string, type?: string, sink?: string): string | null;
}

export interface TrustedTypesFactory {
  readonly defaultPolicy?: unknown;
  createPolicy(name: string, rules: ScriptUrlPolicyRules): unknown;
}

export const SCRIPT_URL_POLICY = 'default';
export const WORKER_SINK = 'Worker constructor';
export const SERVICE_WORKER_SINK = 'ServiceWorkerContainer register';

const SCRIPT_PATHS_BY_SINK: ReadonlyMap<string, RegExp> = new Map([
  [WORKER_SINK, /^\/worker-[A-Za-z0-9_-]{8}\.js$/],
  [SERVICE_WORKER_SINK, /^\/ngsw-worker\.js$/],
]);

export function admittedScriptUrl(input: string, sink: string, baseUrl: string): string | null {
  const paths = SCRIPT_PATHS_BY_SINK.get(sink);
  if (paths === undefined || input === '') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(input, baseUrl);
  } catch {
    return null;
  }
  const site = new URL(baseUrl);
  const ownAddress =
    (site.protocol === 'https:' || site.protocol === 'http:') &&
    url.href === `${site.origin}${url.pathname}`;
  return ownAddress && paths.test(url.pathname) ? url.href : null;
}

export function installScriptUrlPolicy(
  factory: TrustedTypesFactory | undefined,
  baseUrl: string,
): void {
  if (factory === undefined || factory.defaultPolicy) {
    return;
  }
  try {
    factory.createPolicy(SCRIPT_URL_POLICY, {
      createScriptURL: (input, _type, sink) => admittedScriptUrl(input, sink ?? '', baseUrl),
    });
  } catch {
    return;
  }
}
