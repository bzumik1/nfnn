export interface Config {
  readonly port: number;
  readonly backendUrl: string;
  readonly logFile?: string;
  readonly revision: string;
  readonly version: string;
}

const DEFAULT_PORT = 8081;
const DEFAULT_BACKEND_URL = 'http://backend:8080';
const DEV_BUILD = 'dev';
const RELEASE = /^(?:\d{4}\.(?:1[0-2]|[1-9])\.[1-9]\d{0,3}|dev)$/;

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const port = env['PORT'] === undefined ? DEFAULT_PORT : Number(env['PORT']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a port number, got "${env['PORT']}"`);
  }
  const version = env['APP_VERSION'] || DEV_BUILD;
  if (!RELEASE.test(version)) {
    throw new Error('APP_VERSION must be a release such as 2026.11.3, or dev');
  }
  const logFile = env['LOG_FILE'];
  return {
    port,
    backendUrl: stripTrailingSlash(env['BACKEND_URL'] || DEFAULT_BACKEND_URL),
    ...(logFile ? { logFile } : {}),
    revision: env['APP_REVISION'] || DEV_BUILD,
    version,
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
