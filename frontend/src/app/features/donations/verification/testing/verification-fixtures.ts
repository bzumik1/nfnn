import { sharedCases, type VerifiedReceipt } from '../../../../../testing/shared-cases';
import { PROOF_ADDRESS } from '../receipt-proof';

export interface ProofCase {
  readonly fragment: string;
  readonly statusSha256: string;
  readonly receipt: VerifiedReceipt;
}

export function proofCase(name: string): ProofCase {
  const found = sharedCases('verification/payload.json').find(
    (sharedCase) => sharedCase.name === name,
  );
  if (found === undefined) {
    throw new Error(`The shared verification case "${name}" is missing`);
  }
  const { input, expected } = found;
  const qrText = 'qrText' in expected ? expected.qrText : 'qrText' in input ? input.qrText : '';
  return {
    fragment: qrText.slice(PROOF_ADDRESS.length),
    statusSha256: 'statusSha256' in expected ? expected.statusSha256 : '',
    receipt:
      'receipt' in input ? input.receipt : (expected as { receipt: VerifiedReceipt }).receipt,
  };
}

export const TEST_KEY = {
  keyId: '21fe31df',
  algorithm: 'Ed25519',
  publicKey: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  status: 'active',
  registeredAt: '2026-11-13T11:00:00Z',
};

export function keyListWith(keys: readonly object[]): object {
  return {
    foundation: { name: 'Nová naděje - nadační fond', companyIdentifier: '27278794' },
    keys,
  };
}

export const KEY_LIST = keyListWith([TEST_KEY]);

export const REVOKED_KEY_LIST = keyListWith([{ ...TEST_KEY, status: 'revoked' }]);

export const TAMPERED_KEY_LIST = keyListWith([
  { ...TEST_KEY, publicKey: 'PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw' },
]);

export const OTHER_KEY = {
  keyId: '39f713d0',
  algorithm: 'Ed25519',
  publicKey: 'PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw',
  status: 'active',
  registeredAt: '2026-11-14T11:00:00Z',
};
