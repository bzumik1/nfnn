export interface ScriptUrlPolicyRules {
  createScriptURL(input: string): string | null;
}

export interface TrustedTypesFactory {
  createPolicy(name: string, rules: ScriptUrlPolicyRules): unknown;
}

export const SCRIPT_URL_POLICY = 'default';

const SCRIPT_URL_PATHS = /^\/(?:worker-[A-Za-z0-9_-]{8}\.js|ngsw-worker\.js)$/;

export function admitsScriptUrl(input: string, documentUrl: string): boolean {
  if (input === '') {
    return false;
  }
  let url: URL;
  try {
    url = new URL(input, documentUrl);
  } catch {
    return false;
  }
  const page = new URL(documentUrl);
  return (
    (page.protocol === 'https:' || page.protocol === 'http:') &&
    SCRIPT_URL_PATHS.test(url.pathname) &&
    url.href === `${page.origin}${url.pathname}`
  );
}

export function installScriptUrlPolicy(
  factory: TrustedTypesFactory | undefined,
  documentUrl: string,
): void {
  factory?.createPolicy(SCRIPT_URL_POLICY, {
    createScriptURL: (input) => (admitsScriptUrl(input, documentUrl) ? input : null),
  });
}
