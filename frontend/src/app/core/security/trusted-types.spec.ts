import {
  SCRIPT_URL_POLICY,
  ScriptUrlPolicyRules,
  TrustedTypesFactory,
  admitsScriptUrl,
  installScriptUrlPolicy,
} from './trusted-types';

const PAGE = 'https://nfnn.cz/darce/prehled';

describe('Given the Trusted Types policy for script URLs', () => {
  it.each([
    ['https://nfnn.cz/worker-F2S2AQ7E.js', 'the receipt PDF worker'],
    ['https://nfnn.cz/worker-IDICV5FK.js', 'the QR code reader worker'],
    ['https://nfnn.cz/worker-ab_-9Zxy.js', 'a worker hash with an underscore and a hyphen'],
    ['/ngsw-worker.js', 'the service worker, given as an absolute path'],
    ['ngsw-worker.js', 'the service worker, given relative to the page'],
  ])('when %s is asked for (%s), then it is admitted', (input) => {
    expect(admitsScriptUrl(input, PAGE)).toBe(true);
  });

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
    ['blob:https://nfnn.cz/1b4e28ba-2fa1-11d2-883f-0016d3cca427', 'a blob of the site'],
    ['data:text/javascript,postMessage(1)', 'a data address'],
    ['javascript:alert(1)', 'a javascript address'],
    ['//evil.example/ngsw-worker.js', 'a protocol-relative address'],
    ['', 'an empty address'],
  ])('when %s is asked for (%s), then it is refused', (input) => {
    expect(admitsScriptUrl(input, PAGE)).toBe(false);
  });

  describe('when it is installed into a browser with Trusted Types', () => {
    function installed(): { name: string; rules: ScriptUrlPolicyRules }[] {
      const created: { name: string; rules: ScriptUrlPolicyRules }[] = [];
      const factory: TrustedTypesFactory = {
        createPolicy: (name, rules) => created.push({ name, rules }),
      };
      installScriptUrlPolicy(factory, PAGE);
      return created;
    }

    it('then it creates one default policy', () => {
      expect(installed().map(({ name }) => name)).toEqual([SCRIPT_URL_POLICY]);
      expect(SCRIPT_URL_POLICY).toBe('default');
    });

    it('then the policy passes an admitted worker address through unchanged', () => {
      const [{ rules }] = installed();

      expect(rules.createScriptURL('https://nfnn.cz/worker-F2S2AQ7E.js')).toBe(
        'https://nfnn.cz/worker-F2S2AQ7E.js',
      );
    });

    it('then the policy answers null for any other address, so the browser refuses it', () => {
      const [{ rules }] = installed();

      expect(rules.createScriptURL('https://evil.example/x.js')).toBeNull();
    });

    it('then the policy turns no text into HTML or script', () => {
      const [{ rules }] = installed();

      expect(Object.keys(rules)).toEqual(['createScriptURL']);
    });
  });

  it('when the browser has no Trusted Types, then nothing is installed and nothing fails', () => {
    expect(() => installScriptUrlPolicy(undefined, PAGE)).not.toThrow();
  });
});
