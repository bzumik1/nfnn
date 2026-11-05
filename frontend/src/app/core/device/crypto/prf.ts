import { base64UrlToBytes, framed } from './device-bytes';

export const PRF_OUTPUT_LENGTH = 32;
export const PRF_TIMEOUT_MS = 120_000;

export interface PrfRequest {
  readonly rpId: string;
  readonly deviceSalt: string;
  readonly credentialIds: readonly string[];
}

export interface PrfReading {
  readonly credentialId: string;
  readonly userHandle: string | null;
  readonly output: Uint8Array<ArrayBuffer>;
}

export async function prfInput(deviceSalt: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    framed('nfnn-prf-v1', base64UrlToBytes(deviceSalt)),
  );
  return new Uint8Array(digest);
}

export async function readPrf(
  credentials: CredentialsContainer,
  request: PrfRequest,
): Promise<PrfReading | null> {
  void credentials;
  void request;
  return null;
}
