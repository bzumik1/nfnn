export interface ScriptUrlPolicyRules {
  createScriptURL(input: string): string | null;
}

export interface TrustedTypesFactory {
  createPolicy(name: string, rules: ScriptUrlPolicyRules): unknown;
}

export const SCRIPT_URL_POLICY = 'default';

const SCRIPT_URL_PATHS = /^\/(?:worker-[A-Za-z0-9_-]{8}\.js|ngsw-worker\.js)$/;

export function admitsScriptUrl(input: string, baseUrl: string): boolean {
  if (input === '') {
    return false;
  }
  let url: URL;
  try {
    url = new URL(input, baseUrl);
  } catch {
    return false;
  }
  const site = new URL(baseUrl);
  return (
    (site.protocol === 'https:' || site.protocol === 'http:') &&
    SCRIPT_URL_PATHS.test(url.pathname) &&
    url.href === `${site.origin}${url.pathname}`
  );
}

export function installScriptUrlPolicy(
  factory: TrustedTypesFactory | undefined,
  baseUrl: string,
): void {
  factory?.createPolicy(SCRIPT_URL_POLICY, {
    createScriptURL: (input) => (admitsScriptUrl(input, baseUrl) ? input : null),
  });
}
