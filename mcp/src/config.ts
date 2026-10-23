export interface Config {
  readonly port: number;
  readonly backendUrl: string;
  readonly logsDir: string;
}

const DEFAULT_PORT = 8081;
const DEFAULT_BACKEND_URL = 'http://backend:8080';
const DEFAULT_LOGS_DIR = '/logs';

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const port = env['PORT'] === undefined ? DEFAULT_PORT : Number(env['PORT']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a port number, got "${env['PORT']}"`);
  }
  return {
    port,
    backendUrl: stripTrailingSlash(env['BACKEND_URL'] || DEFAULT_BACKEND_URL),
    logsDir: env['LOGS_DIR'] || DEFAULT_LOGS_DIR,
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
