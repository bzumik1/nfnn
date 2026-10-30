import { nobleEd25519Verifies } from './noble-ed25519';
import type { SignatureCheck } from './receipt-proof';

const ED25519 = { name: 'Ed25519' };

export const webCryptoEd25519Verifies: SignatureCheck = async (publicKey, message, signature) => {
  const key = await crypto.subtle.importKey('raw', publicKey, ED25519, false, ['verify']);
  return crypto.subtle.verify(ED25519, key, signature, message);
};

export const ed25519Verifies: SignatureCheck = async (publicKey, message, signature) => {
  let verified: boolean;
  try {
    verified = await webCryptoEd25519Verifies(publicKey, message, signature);
  } catch {
    return nobleEd25519Verifies(publicKey, message, signature);
  }
  return verified;
};
