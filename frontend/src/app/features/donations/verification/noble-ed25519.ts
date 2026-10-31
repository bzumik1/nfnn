import type { SignatureCheck } from './receipt-proof';

export const nobleEd25519Verifies: SignatureCheck = async (publicKey, message, signature) => {
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  try {
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
};
