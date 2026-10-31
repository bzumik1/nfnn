import { sharedCases } from '../../../../../testing/shared-cases';
import { FrozenReceipt } from '../frozen-receipt';
import { ReceiptCaptions } from '../receipt-document';

export const TEST_CAPTIONS: ReceiptCaptions = {
  verificationHeading: { cs: 'Ověření potvrzení', en: 'Verification' },
  verificationText: {
    cs: 'Naskenujte kód nebo na něj klikněte.',
    en: 'Scan the code or click it.',
  },
  verificationAlt: 'Ověřovací QR kód',
  signatureAlt: 'Podpis',
  portraitAlt: 'Portrét',
};

export function frozenCase(name: string): FrozenReceipt {
  const found = sharedCases('receipts/v1/frozen.json').find(
    (sharedCase) => sharedCase.name === name,
  );
  if (found === undefined) {
    throw new Error(`receipts/v1/frozen.json has no case ${name}`);
  }
  return structuredClone(found.expected) as FrozenReceipt;
}

export function frozenCases(): readonly {
  name: string;
  receipt: FrozenReceipt;
  v2Sample: string;
}[] {
  return sharedCases('receipts/v1/frozen.json').map((sharedCase) => ({
    name: sharedCase.name,
    receipt: structuredClone(sharedCase.expected) as FrozenReceipt,
    v2Sample: sharedCase.input.v2Sample,
  }));
}

export const SINGLE_PERSON_CS = 'History sample: one gift of a person, Czech';
export const YEARLY_BILINGUAL =
  "History sample: a person's year with two gifts, English and so bilingual";
export const COMPANY_REPLACEMENT =
  'History sample: one gift of a company, replacing an earlier receipt, Czech';
export const YEARLY_120 =
  "History sample: a person's year with 120 gifts over several pages, Czech";
export const YEARLY_40 =
  "A person's year with 40 gifts, Czech. Three are received on 5 May and given in this order: 5,000.00 CZK recorded at 12:00, 100.00 CZK recorded at 8:00 with the higher id and 200.00 CZK recorded at 8:00 with the lower id; v2 lists gifts by the day received, then the time recorded, then the id";
export const YEARLY_366 =
  "A person's leap year 2028 with one gift on each of its 366 days, English";
export const YEARLY_ONE = "A person's year with exactly one gift, Czech";
export const SINGLE_SIGNATURE =
  'One gift of a person on a receipt that carries the signature image';
export const SINGLE_PERSON_EN =
  'One gift of a person who prefers English, so a bilingual single receipt';
export const SINGLE_MANUAL = 'One gift recorded by hand, not by bank transfer, Czech';
