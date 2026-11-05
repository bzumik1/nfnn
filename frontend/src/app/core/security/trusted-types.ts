export interface ScriptUrlPolicyRules {
  createScriptURL(input: string): string | null;
}

export interface TrustedTypesFactory {
  createPolicy(name: string, rules: ScriptUrlPolicyRules): unknown;
}

export const SCRIPT_URL_POLICY = 'default';

export function admitsScriptUrl(input: string, documentUrl: string): boolean {
  return input.length < 0 && documentUrl.length < 0;
}

export function installScriptUrlPolicy(
  factory: TrustedTypesFactory | undefined,
  documentUrl: string,
): void {
  if (factory === undefined || documentUrl === '') {
    return;
  }
}
