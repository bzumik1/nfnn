import { createServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createApp } from './app.js';
import { AuthorizationServerDiscovery } from './authorization.js';
import { BackendClient } from './backend.js';
import { configFromEnv } from './config.js';
import { LogReader } from './logs.js';
import { TokenExchangeVerifier, type Logger } from './token-exchange.js';

const config = configFromEnv(process.env);
const version = process.env['APP_REVISION'] || 'dev';
const logger: Logger = {
  info: (message) => console.log(`${new Date().toISOString()} INFO ${message}`),
  warn: (message) => console.warn(`${new Date().toISOString()} WARN ${message}`),
};
const discovery = new AuthorizationServerDiscovery(config.backendUrl, fetch);
const app = createApp({
  discovery,
  verifier: new TokenExchangeVerifier(discovery, config.backendUrl, fetch, logger),
  backend: new BackendClient(config.backendUrl, fetch),
  logs: new LogReader(config.logsDir),
  logger,
  version,
});

const server = createServer(
  toNodeHandler(app, {
    onerror: (error) => logger.warn(`Request failed: ${error.constructor.name}`),
  }),
);
server.listen(config.port, '0.0.0.0', () => {
  logger.info(
    `MCP connector revision ${version} listening on ${config.port}, backend ${config.backendUrl}`,
  );
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`Stopping on ${signal}`);
    server.close(() => process.exit(0));
    void app.close();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
