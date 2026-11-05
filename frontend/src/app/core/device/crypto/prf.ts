export interface PrfRequest {
  readonly rpId: string;
  readonly credentialId: string;
  readonly copySalt: string;
}

export async function prfInput(copySalt: string): Promise<Uint8Array<ArrayBuffer>> {
  throw new Error('not implemented');
}

export async function readPrf(
  credentials: CredentialsContainer,
  request: PrfRequest,
): Promise<Uint8Array<ArrayBuffer> | null> {
  throw new Error('not implemented');
}
