export const SIGNATORY_ID = '0199f3e0-0000-7000-8000-00000000c009';

export function signatory(
  overrides: Partial<{
    personId: string;
    name: string;
    receiptRole: string;
    portrait: boolean;
    portraitPrintable: boolean;
    signature: boolean;
  }> = {},
) {
  return {
    signatory: {
      personId: SIGNATORY_ID,
      name: 'Petr Vzorový',
      receiptRole: 'předseda správní rady',
      chosenAt: '2026-10-31T08:00:00Z',
      portrait: false,
      portraitPrintable: overrides.portrait ?? false,
      signature: false,
      ...overrides,
    },
  };
}

export const noSignatory = { signatory: null };
