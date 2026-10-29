export const DONATE_SECTION = '/#prispet';

const CONFIRMATION_RETURNS = [DONATE_SECTION] as const;

export type ConfirmationReturn = (typeof CONFIRMATION_RETURNS)[number];

export function confirmationReturnOf(value: string | null): ConfirmationReturn | null {
  return CONFIRMATION_RETURNS.find((allowed) => allowed === value) ?? null;
}
