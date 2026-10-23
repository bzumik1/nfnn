import { describe, expect, it } from 'vitest';
import { configFromEnv } from '../src/config.js';

describe('Given the environment of the connector container', () => {
  it('when nothing is set, then it listens on 8081, calls the backend by its link and writes no file', () => {
    expect(configFromEnv({})).toEqual({ port: 8081, backendUrl: 'http://backend:8080' });
  });

  it('when a log file is named, then the connector appends its lines to it', () => {
    expect(configFromEnv({ LOG_FILE: '/logs/mcp.log' }).logFile).toBe('/logs/mcp.log');
  });

  it('when the log file is empty, then the connector logs to the console only', () => {
    expect(configFromEnv({ LOG_FILE: '' }).logFile).toBeUndefined();
  });

  it('when the port is not a port number, then the start fails', () => {
    expect(() => configFromEnv({ PORT: 'abc' })).toThrow('PORT must be a port number, got "abc"');
  });
});
