import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface VerificationCase {
  name: string;
  input: { qrText?: string; receipt?: { donor: { name: string } } };
  expected: { qrText?: string; signedSha256?: string };
}

const VERIFICATION_CASES: { cases: VerificationCase[] } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'shared-cases', 'verification', 'payload.json'), 'utf8'),
);

const PROOF_ADDRESS = 'https://nfnn.cz/overit#';
const STORAGE_KEY = 'nfnn.receipt-keys';

export interface VerificationProof {
  readonly fragment: string;
  readonly signedSha256: string;
}

export function proof(name: string): VerificationProof {
  const found = VERIFICATION_CASES.cases.find((sharedCase) => sharedCase.name === name);
  const qrText = found?.expected.qrText ?? found?.input.qrText;
  if (qrText === undefined || !qrText.startsWith(PROOF_ADDRESS)) {
    throw new Error(`shared-cases/verification/payload.json has no QR text for the case ${name}`);
  }
  return {
    fragment: qrText.slice(PROOF_ADDRESS.length),
    signedSha256: found?.expected.signedSha256 ?? '',
  };
}

export const SINGLE_RECEIPT = proof('a single receipt of one gift');
export const YEARLY_RECEIPT = proof('a yearly receipt of 12 gifts');
export const CHANGED_AMOUNT = proof('an amount changed');

const TEST_KEY = {
  keyId: '21fe31df',
  algorithm: 'Ed25519',
  publicKey: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
  status: 'active',
  registeredAt: '2026-11-13T11:00:00Z',
};

const OTHER_KEY = {
  keyId: '39f713d0',
  algorithm: 'Ed25519',
  publicKey: 'PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw',
  status: 'active',
  registeredAt: '2026-11-14T11:00:00Z',
};

export function keyList(keys: readonly object[] = [TEST_KEY]): object {
  return {
    foundation: { name: 'Nová naděje - nadační fond', companyIdentifier: '27278794' },
    keys,
  };
}

export const KEY_LIST = keyList();
export const REVOKED_KEY_LIST = keyList([{ ...TEST_KEY, status: 'revoked' }]);
export const TAMPERED_KEY_LIST = keyList([{ ...TEST_KEY, publicKey: OTHER_KEY.publicKey }]);
export const LIST_WITHOUT_THE_KEY = keyList([OTHER_KEY]);

export async function serveReceiptKeys(page: Page, list: object = KEY_LIST): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/donations/receipt-keys',
    (route) => route.fulfill({ json: list }),
  );
}

export async function serveReceiptStatus(page: Page, status: string): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/donations/receipts/status',
    (route) => route.fulfill({ json: { status }, headers: { 'Cache-Control': 'no-store' } }),
  );
}

export async function keepKeyList(page: Page, list: object = KEY_LIST): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, value);
      }
    },
    [STORAGE_KEY, JSON.stringify(list)] as const,
  );
}

export async function keptKeyList(page: Page): Promise<unknown> {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'),
    STORAGE_KEY,
  );
}

export async function scanAfterLoad(page: Page, verification: VerificationProof): Promise<void> {
  await page.evaluate((fragment) => (window.location.hash = fragment), verification.fragment);
}

export async function withoutWebCryptoEd25519(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const importKey = SubtleCrypto.prototype.importKey;
    SubtleCrypto.prototype.importKey = function (
      this: SubtleCrypto,
      ...args: Parameters<SubtleCrypto['importKey']>
    ) {
      const algorithm = args[2];
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      return name === 'Ed25519'
        ? Promise.reject(new DOMException('Unrecognized name.', 'NotSupportedError'))
        : (importKey.apply(this, args) as ReturnType<SubtleCrypto['importKey']>);
    } as SubtleCrypto['importKey'];
  });
}
