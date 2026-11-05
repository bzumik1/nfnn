import {
  SCRIPT_URL_POLICY,
  SERVICE_WORKER_SINK,
  ScriptUrlPolicyRules,
  TrustedTypesFactory,
  WORKER_SINK,
  admittedScriptUrl,
  installScriptUrlPolicy,
} from './trusted-types';

const BASE = 'https://nfnn.cz/';

describe('Given the Trusted Types policy for script URLs', () => {
  it.each([
    ['https://nfnn.cz/worker-F2S2AQ7E.js', 'the receipt PDF worker'],
    ['https://nfnn.cz/worker-IDICV5FK.js', 'the QR code reader worker'],
    ['https://nfnn.cz/worker-ab_-9Zxy.js', 'a worker hash with an underscore and a hyphen'],
    ['/worker-F2S2AQ7E.js', 'a worker given as an absolute path'],
    [
      'https://nfnn.cz/%2e%2e/worker-F2S2AQ7E.js',
      'an encoded parent folder, which the address parser resolves to the same worker',
    ],
  ])(
    'when the worker constructor asks for %s (%s), then the resolved address is admitted',
    (input) => {
      expect(admittedScriptUrl(input, WORKER_SINK, BASE)).toBe(
        new URL('/worker-' + input.split('/worker-')[1], BASE).href,
      );
    },
  );

  it.each([
    ['/ngsw-worker.js', 'an absolute path'],
    ['ngsw-worker.js', 'a path relative to the base address'],
  ])(
    'when the service worker registration asks for its script as %s, then it is admitted',
    (input) => {
      expect(admittedScriptUrl(input, SERVICE_WORKER_SINK, BASE)).toBe(
        'https://nfnn.cz/ngsw-worker.js',
      );
    },
  );

  it.each([
    ['https://evil.example/worker-F2S2AQ7E.js', 'another origin'],
    ['http://nfnn.cz/worker-F2S2AQ7E.js', 'the same host without TLS'],
    ['https://nfnn.cz:8443/worker-F2S2AQ7E.js', 'the same host on another port'],
    ['https://user@nfnn.cz/worker-F2S2AQ7E.js', 'a user name in the address'],
    ['https://nfnn.cz/worker-F2S2AQ7E.js?x=1', 'a query'],
    ['https://nfnn.cz/worker-F2S2AQ7E.js#x', 'a fragment'],
    ['https://nfnn.cz/worker-F2S2AQ7.js', 'a hash of seven characters'],
    ['https://nfnn.cz/worker-F2S2AQ7E9.js', 'a hash of nine characters'],
    ['https://nfnn.cz/media/worker-F2S2AQ7E.js', 'a worker name in another folder'],
    ['https://nfnn.cz/main-F2S2AQ7E.js', 'the main bundle'],
    ['https://nfnn.cz/chunk-F2S2AQ7E.js', 'a lazy chunk'],
    ['https://nfnn.cz/api/worker-F2S2AQ7E.js', 'an address under /api'],
    ['https://nfnn.cz/ngsw-worker.js', 'the service worker script started as a plain worker'],
    ['blob:https://nfnn.cz/1b4e28ba-2fa1-11d2-883f-0016d3cca427', 'a blob of the site'],
    ['data:text/javascript,postMessage(1)', 'a data address'],
    ['javascript:alert(1)', 'a javascript address'],
    ['//evil.example/worker-F2S2AQ7E.js', 'a protocol-relative address'],
    ['', 'an empty address'],
  ])('when the worker constructor asks for %s (%s), then it is refused', (input) => {
    expect(admittedScriptUrl(input, WORKER_SINK, BASE)).toBeNull();
  });

  it.each([
    ['https://nfnn.cz/worker-F2S2AQ7E.js', 'a worker script registered as the service worker'],
    ['darce/ngsw-worker.js', 'the service worker name in another folder'],
    ['https://evil.example/ngsw-worker.js', 'another origin'],
  ])('when the service worker registration asks for %s (%s), then it is refused', (input) => {
    expect(admittedScriptUrl(input, SERVICE_WORKER_SINK, BASE)).toBeNull();
  });

  it.each([
    ['HTMLScriptElement src'],
    ['WorkerGlobalScope importScripts'],
    ['SharedWorker constructor'],
    [''],
  ])(
    'when any other sink (%s) asks for a worker address of the site, then it is refused',
    (sink) => {
      expect(admittedScriptUrl('https://nfnn.cz/worker-F2S2AQ7E.js', sink, BASE)).toBeNull();
      expect(admittedScriptUrl('https://nfnn.cz/ngsw-worker.js', sink, BASE)).toBeNull();
    },
  );

  describe('when it is installed into a browser with Trusted Types', () => {
    function installed(existingDefault?: unknown): { name: string; rules: ScriptUrlPolicyRules }[] {
      const created: { name: string; rules: ScriptUrlPolicyRules }[] = [];
      const factory: TrustedTypesFactory = {
        defaultPolicy: existingDefault ?? null,
        createPolicy: (name, rules) => created.push({ name, rules }),
      };
      installScriptUrlPolicy(factory, BASE);
      return created;
    }

    it('then it creates one default policy', () => {
      expect(installed().map(({ name }) => name)).toEqual([SCRIPT_URL_POLICY]);
      expect(SCRIPT_URL_POLICY).toBe('default');
    });

    it('then the policy gives the worker constructor the admitted address', () => {
      const [{ rules }] = installed();

      expect(rules.createScriptURL('/worker-F2S2AQ7E.js', 'TrustedScriptURL', WORKER_SINK)).toBe(
        'https://nfnn.cz/worker-F2S2AQ7E.js',
      );
    });

    it('then the policy answers null for any other address or sink, so the browser refuses it', () => {
      const [{ rules }] = installed();

      expect(
        rules.createScriptURL('https://evil.example/x.js', 'TrustedScriptURL', WORKER_SINK),
      ).toBeNull();
      expect(
        rules.createScriptURL('/worker-F2S2AQ7E.js', 'TrustedScriptURL', 'HTMLScriptElement src'),
      ).toBeNull();
    });

    it('then the policy turns no text into HTML or script', () => {
      const [{ rules }] = installed();

      expect(Object.keys(rules)).toEqual(['createScriptURL']);
    });

    it('and a default policy already exists (an extension made one first), then none is created and nothing fails, so the site still starts', () => {
      expect(installed({ name: 'default' })).toEqual([]);
    });
  });

  it('when the browser refuses to create the policy, then nothing fails, so the site still starts', () => {
    const factory: TrustedTypesFactory = {
      defaultPolicy: null,
      createPolicy: () => {
        throw new TypeError('Policy "default" disallowed.');
      },
    };

    expect(() => installScriptUrlPolicy(factory, BASE)).not.toThrow();
  });

  it('when the browser has no Trusted Types, then nothing is installed and nothing fails', () => {
    expect(() => installScriptUrlPolicy(undefined, BASE)).not.toThrow();
  });
});
