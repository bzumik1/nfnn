export interface Config {
  readonly port: number;
  readonly backendUrl: string;
  readonly logFile?: string;
}

const DEFAULT_PORT = 8081;
const DEFAULT_BACKEND_URL = 'http://backend:8080';

export function configFromEnv(env: NodeJS.ProcessEnv): Config {
  const port = env['PORT'] === undefined ? DEFAULT_PORT : Number(env['PORT']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a port number, got "${env['PORT']}"`);
  }
  const logFile = env['LOG_FILE'];
  return {
    port,
    backendUrl: stripTrailingSlash(env['BACKEND_URL'] || DEFAULT_BACKEND_URL),
    ...(logFile ? { logFile } : {}),
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
