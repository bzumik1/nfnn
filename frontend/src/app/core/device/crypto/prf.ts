import { base64UrlToBytes, bytesToBase64Url, framed, randomBytes } from './device-bytes';

export const PRF_OUTPUT_LENGTH = 32;
export const PRF_TIMEOUT_MS = 120_000;
const FLAGS_OFFSET = 32;
const USER_VERIFIED = 0x04;

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
  const credential = await credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: request.rpId,
      timeout: PRF_TIMEOUT_MS,
      userVerification: 'required',
      ...(request.credentialIds.length === 0
        ? {}
        : {
            allowCredentials: request.credentialIds.map((id) => ({
              type: 'public-key' as const,
              id: base64UrlToBytes(id),
            })),
          }),
      extensions: { prf: { eval: { first: await prfInput(request.deviceSalt) } } },
    },
  });
  if (credential === null || credential.type !== 'public-key') {
    return null;
  }
  const publicKey = credential as PublicKeyCredential;
  const response = publicKey.response as AuthenticatorAssertionResponse;
  return prfReadingOf(publicKey, response.authenticatorData, request.credentialIds);
}

export function prfReadingOf(
  credential: PublicKeyCredential,
  authenticatorData: ArrayBuffer,
  credentialIds: readonly string[],
): PrfReading | null {
  const output = takenOutput(credential.getClientExtensionResults().prf?.results?.first);
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  if (output === null) {
    return null;
  }
  if (
    (credentialIds.length > 0 && !credentialIds.includes(credentialId)) ||
    !userVerified(authenticatorData)
  ) {
    output.fill(0);
    return null;
  }
  const userHandle = (credential.response as Partial<AuthenticatorAssertionResponse>).userHandle;
  return {
    credentialId,
    userHandle:
      userHandle === null || userHandle === undefined
        ? null
        : bytesToBase64Url(new Uint8Array(userHandle)),
    output,
  };
}

function userVerified(authenticatorData: ArrayBuffer): boolean {
  const data = new Uint8Array(authenticatorData);
  return data.length > FLAGS_OFFSET && (data[FLAGS_OFFSET] & USER_VERIFIED) !== 0;
}

function takenOutput(first: BufferSource | undefined): Uint8Array<ArrayBuffer> | null {
  if (first === undefined) {
    return null;
  }
  const source = ArrayBuffer.isView(first)
    ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
    : new Uint8Array(first);
  const output = new Uint8Array(source);
  source.fill(0);
  if (output.length !== PRF_OUTPUT_LENGTH) {
    output.fill(0);
    return null;
  }
  return output;
}
