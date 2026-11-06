import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectorInstructions, connectorToolList } from '../src/tool-list.js';
import { READ_TOKEN, WRITE_TOKEN } from './fake-backend.js';
import { connect, startApp, type TestApp } from './support.js';

describe('Given the connector without a backend', () => {
  it('when its tool list is produced, then every tool comes with its name, description and input schema', async () => {
    const tools = await connectorToolList();

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool).toEqual(
        expect.objectContaining({
          name: expect.stringMatching(/^nfnn_/),
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
      );
    }
  });

  it('when its instructions are asked, then they name the administration and the web-only actions', async () => {
    const instructions = await connectorInstructions();

    expect(instructions).toContain('Nadační fond Nová naděje');
    expect(instructions).toContain('/sprava');
  });
});

describe('Given a running connector', () => {
  let stack: TestApp;

  beforeEach(async () => {
    stack = await startApp();
  });

  afterEach(async () => {
    await stack.stop();
  });

  it.each([
    ['the reading permission', READ_TOKEN],
    ['the writing permission', WRITE_TOKEN],
  ])(
    'when a client connected with %s lists the tools, then it receives the list produced without a backend',
    async (_permission, token) => {
      const client = await connect(stack.app, token);

      const { tools } = await client.listTools();
      await client.close();

      expect(JSON.parse(JSON.stringify(tools))).toEqual(await connectorToolList());
    },
  );

  it('when a client connects, then it receives the instructions produced without a backend', async () => {
    const client = await connect(stack.app, READ_TOKEN);

    const instructions = client.getInstructions();
    await client.close();

    expect(instructions).toBe(await connectorInstructions());
  });
});
