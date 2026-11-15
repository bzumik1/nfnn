import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const COMPOSE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy/compose.yml'),
  'utf8',
);

const publishedPorts = (compose) => {
  const lines = compose.split('\n');
  const published = [];
  lines.forEach((line, index) => {
    const ports = /^(\s+)ports:\s*$/.exec(line);
    if (!ports) return;
    for (const item of lines.slice(index + 1)) {
      const entry = new RegExp(`^${ports[1]}\\s+-\\s+(.+?)\\s*$`).exec(item);
      if (!entry) break;
      published.push(entry[1].replace(/^(["'])(.*)\1$/, '$2'));
    }
  });
  return published;
};

describe('Given the compose file pasted into ZimaOS', () => {
  test('when its published ports are read, then only the frontend port is published, on IPv4 only', () => {
    assert.deepEqual(publishedPorts(COMPOSE), ['0.0.0.0:8089:80']);
  });

  test('when a port is published without a host address, then the reader sees it as such', () => {
    assert.deepEqual(
      publishedPorts(
        'services:\n  frontend:\n    ports:\n      - "8089:80"\n    volumes:\n      - x:/y\n',
      ),
      ['8089:80'],
    );
  });
});
