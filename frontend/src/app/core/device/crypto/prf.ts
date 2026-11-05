import { base64UrlToBytes, framed, randomBytes } from './device-bytes';

export const PRF_OUTPUT_LENGTH = 32;
export const PRF_TIMEOUT_MS = 120_000;

export interface PrfRequest {
  readonly rpId: string;
  readonly credentialId: string;
  readonly copySalt: string;
}

export async function prfInput(copySalt: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    framed('nfnn-prf-v1', base64UrlToBytes(copySalt)),
  );
  return new Uint8Array(digest);
}

export async function readPrf(
  credentials: CredentialsContainer,
  request: PrfRequest,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const credential = await credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: request.rpId,
      timeout: PRF_TIMEOUT_MS,
      userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: base64UrlToBytes(request.credentialId) }],
      extensions: { prf: { eval: { first: await prfInput(request.copySalt) } } },
    },
  });
  if (credential === null || credential.type !== 'public-key') {
    return null;
  }
  const first = (credential as PublicKeyCredential).getClientExtensionResults().prf?.results?.first;
  if (first === undefined) {
    return null;
  }
  const output = ArrayBuffer.isView(first)
    ? new Uint8Array(first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength))
    : new Uint8Array(first.slice(0));
  return output.length === PRF_OUTPUT_LENGTH ? output : null;
}
