import { PROOF_ADDRESS } from './receipt-proof';

const LONGEST_FRAGMENT = 7_089;
const DIGITS = /^[0-9]+$/;

export function proofFragment(text: string): string | null {
  const link = text.trim();
  if (!link.startsWith(PROOF_ADDRESS)) {
    return null;
  }
  const fragment = link.slice(PROOF_ADDRESS.length);
  return fragment.length <= LONGEST_FRAGMENT && DIGITS.test(fragment) ? fragment : null;
}
