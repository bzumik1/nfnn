import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import type { RouteHost } from './route-host';
import type { Target, Ui } from './ui';

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
export const WAIT_MS = 10_000;
const DRIVER_START_MS = 120_000;
const SESSION_ATTEMPTS = 3;
const SESSION_RETRY_PAUSE_MS = 5_000;
const COMMAND_TIMEOUT_MS = 120_000;
const POLL_MS = 100;

type ElementReference = Record<typeof ELEMENT, string>;

export interface SafariTarget {
  platform: 'iOS' | 'mac';
  devicePattern?: RegExp;
  window?: { width: number; height: number };
}

export interface Simulator {
  udid: string;
  name: string;
  runtime: string;
}

const runtimeVersion = (runtime: string): number[] =>
  (runtime.match(/iOS-(\d+)(?:-(\d+))?/) ?? []).slice(1).map((part) => Number(part ?? 0));

const newerFirst = (a: Simulator, b: Simulator): number => {
  const [majorA = 0, minorA = 0] = runtimeVersion(a.runtime);
  const [majorB = 0, minorB = 0] = runtimeVersion(b.runtime);
  return (
    majorB - majorA || minorB - minorA || b.name.localeCompare(a.name, 'en', { numeric: true })
  );
};

export function availableSimulators(): Simulator[] {
  const listed = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
      encoding: 'utf8',
    }),
  ) as { devices: Record<string, { udid: string; name: string }[]> };
  return Object.entries(listed.devices)
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .flatMap(([runtime, devices]) => devices.map((device) => ({ ...device, runtime })))
    .sort(newerFirst);
}

function shutDownOtherSimulators(kept: string): void {
  const listed = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { encoding: 'utf8' }),
  ) as { devices: Record<string, { udid: string }[]> };
  for (const { udid } of Object.values(listed.devices).flat()) {
    if (udid !== kept) {
      execFileSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
    }
  }
}

export function pickSimulator(pattern: RegExp): Simulator {
  const available = availableSimulators();
  const found = available.find((simulator) => pattern.test(simulator.name));
  if (!found) {
    throw new Error(
      `no iOS simulator matches ${pattern}; available: ${available.map((simulator) => simulator.name).join(', ')}`,
    );
  }
  return found;
}

function freePort(): Promise<number> {
  return new Promise((done, failed) => {
    const server = createServer();
    server.on('error', failed);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

export class WebDriver {
  private constructor(
    private readonly endpoint: string,
    private readonly driver: ChildProcess,
    private readonly sessionId: string,
    readonly device: string,
    private readonly simulator?: Simulator,
  ) {}

  static async start(target: SafariTarget): Promise<WebDriver> {
    const simulator =
      target.platform === 'iOS' && target.devicePattern
        ? pickSimulator(target.devicePattern)
        : undefined;
    if (simulator) {
      shutDownOtherSimulators(simulator.udid);
      execFileSync('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], { stdio: 'ignore' });
    }
    const webDriver = await WebDriver.launch(
      (port) => ['safaridriver', '-p', String(port)],
      simulator
        ? {
            browserName: 'Safari',
            platformName: 'iOS',
            'safari:useSimulator': true,
            'safari:deviceUDID': simulator.udid,
          }
        : { browserName: 'safari', platformName: 'mac' },
      simulator ? `${simulator.name} (${simulator.runtime.split('.').pop()})` : 'Safari on macOS',
      simulator,
    );
    if (target.window) {
      await webDriver.command('POST', '/window/rect', { x: 0, y: 0, ...target.window });
    }
    return webDriver;
  }

  static async launch(
    command: (port: number) => string[],
    capabilities: Record<string, unknown>,
    device: string,
    simulator?: Simulator,
  ): Promise<WebDriver> {
    for (let attempt = 1; ; attempt++) {
      const port = await freePort();
      const endpoint = `http://127.0.0.1:${port}`;
      const [program = '', ...args] = command(port);
      const driver = spawn(program, args, { stdio: 'inherit' });
      try {
        await waitUntilReady(endpoint, program);
        const created = await call<{ sessionId: string }>(endpoint, 'POST', '/session', {
          capabilities: { alwaysMatch: capabilities },
        });
        return new WebDriver(endpoint, driver, created.sessionId, device, simulator);
      } catch (error) {
        driver.kill();
        if (attempt >= SESSION_ATTEMPTS) {
          throw error;
        }
        console.warn(`${device}: no WebDriver session at attempt ${attempt}: ${String(error)}`);
        await pause(SESSION_RETRY_PAUSE_MS);
      }
    }
  }

  async stop(): Promise<void> {
    await this.command('DELETE', '').catch(() => undefined);
    this.driver.kill();
  }

  command<T>(method: string, path: string, body?: unknown): Promise<T> {
    return call<T>(this.endpoint, method, `/session/${this.sessionId}${path}`, body);
  }

  navigate(url: string): Promise<void> {
    return this.command('POST', '/url', { url });
  }

  execute<T>(script: string, ...args: unknown[]): Promise<T> {
    return this.command('POST', '/execute/sync', { script, args });
  }

  executeAsync<T>(script: string, ...args: unknown[]): Promise<T> {
    return this.command('POST', '/execute/async', { script, args });
  }

  async screenshot(): Promise<Buffer> {
    return Buffer.from(await this.command<string>('GET', '/screenshot'), 'base64');
  }

  deleteCookies(): Promise<void> {
    return this.command('DELETE', '/cookie');
  }
}

async function waitUntilReady(endpoint: string, program: string): Promise<void> {
  const deadline = Date.now() + DRIVER_START_MS;
  while (!(await ready(endpoint))) {
    if (Date.now() > deadline) {
      throw new Error(
        `${program} did not start; for Safari run \`sudo safaridriver --enable\` once`,
      );
    }
    await pause(200);
  }
}

async function ready(endpoint: string): Promise<boolean> {
  try {
    const status = (await (await fetch(`${endpoint}/status`)).json()) as {
      value?: { ready?: boolean };
    };
    return status.value?.ready === true;
  } catch {
    return false;
  }
}

async function call<T>(endpoint: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, {
    signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const answer = (await response.json()) as { value: T & { error?: string; message?: string } };
  if (!response.ok) {
    throw new Error(`WebDriver ${method} ${path}: ${answer.value.error}: ${answer.value.message}`);
  }
  return answer.value;
}

export const NEXT_FRAMES =
  'const done = arguments[arguments.length - 1]; requestAnimationFrame(() => requestAnimationFrame(done));';

const ELEMENT_AT_CENTRE = `
const box = arguments[0].getBoundingClientRect();
const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
return top ? top.outerHTML.slice(0, 200) : 'nothing';`;

const FIND_SHOWN = `
const [css, text] = arguments;
const normal = (value) => value.replace(/\\s+/g, ' ').trim().toLowerCase();
for (const element of document.querySelectorAll(css)) {
  if (text && !normal(element.textContent || '').includes(normal(text))) continue;
  const box = element.getBoundingClientRect();
  if (box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') return element;
}
return null;`;

async function until<T>(
  what: string,
  waitMs: number,
  attempt: () => Promise<T | null | undefined>,
): Promise<T> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const found = await attempt();
    if (found) {
      return found;
    }
    if (Date.now() > deadline) {
      throw new Error(`waited ${waitMs} ms for ${what}`);
    }
    await pause(POLL_MS);
  }
}

const described = ({ css, text }: Target) => (text ? `${css} with "${text}"` : css);

export interface Waits {
  ms: number;
}

export function webDriverUi(
  driver: WebDriver,
  host: RouteHost,
  baseUrl: string,
  waits: Waits = { ms: WAIT_MS },
): Ui {
  const find = (target: Target) =>
    driver.execute<ElementReference | null>(FIND_SHOWN, target.css, target.text ?? '');
  const shown = (target: Target) =>
    until(`${described(target)} to show`, waits.ms, () => find(target));
  return {
    routes: host.routes,
    rememberSession: async () => host.rememberSession(),
    goto: (path) => driver.navigate(new URL(path, baseUrl).href),
    isVisible: async (target) => !!(await find(target)),
    waitVisible: async (target) => {
      await shown(target);
    },
    click: async (target) => {
      const element = await shown(target);
      await driver.execute(
        "arguments[0].scrollIntoView({ block: 'center', behavior: 'instant' });",
        element,
      );
      await driver.executeAsync(NEXT_FRAMES);
      await driver
        .command('POST', `/element/${element[ELEMENT]}/click`, {})
        .catch(async (error: unknown) => {
          const atCentre = await driver.execute<string>(ELEMENT_AT_CENTRE, element);
          throw new Error(`${String(error)}; at its centre: ${atCentre}`);
        });
    },
    waitAttribute: async (target, name, value) => {
      await until(`${described(target)} to have ${name}="${value}"`, waits.ms, async () => {
        const element = await find(target);
        return (
          element &&
          (await driver.execute<string | null>(
            'return arguments[0].getAttribute(arguments[1]);',
            element,
            name,
          )) === value
        );
      });
    },
    scrollToTop: async (target) => {
      const element = await shown(target);
      await driver.execute("arguments[0].scrollIntoView({ behavior: 'instant' });", element);
    },
  };
}
