import { Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QrMatrixFixture {
  size: number;
  modules: string;
}

interface PaymentQrCase {
  name: string;
  expected: { size?: number; matrix?: string[] };
}

interface PaymentDetailsCase {
  name: string;
  expected: PaymentDetailsFixture;
}

export interface PaymentDetailsFixture {
  account: { number: string; iban: string; recipientName: string };
  currency: string;
  messages: { donation: string; accountVerification: string };
  accountVerificationAmountMinor: number;
}

function sharedCaseFile<T>(...path: string[]): { cases: T[] } {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', 'shared-cases', ...path), 'utf8'));
}

const PAYMENT_QR_CASES = sharedCaseFile<PaymentQrCase>('qr', 'payment.json');

const PAYMENT_DETAILS_CASES = sharedCaseFile<PaymentDetailsCase>('payment', 'details.json');

function paymentDetailsOf(name: string): PaymentDetailsFixture {
  const details = PAYMENT_DETAILS_CASES.cases.find((sharedCase) => sharedCase.name === name);
  if (details === undefined) {
    throw new Error(`shared-cases/payment/details.json has no case ${name}`);
  }
  return details.expected;
}

function paymentQr(name: string): QrMatrixFixture {
  const { size, matrix } =
    PAYMENT_QR_CASES.cases.find((sharedCase) => sharedCase.name === name)?.expected ?? {};
  if (size === undefined || matrix === undefined) {
    throw new Error(`shared-cases/qr/payment.json has no QR symbol for the case ${name}`);
  }
  return { size, modules: matrix.join('') };
}

export const PAYMENT_QR_500 = paymentQr('500 Kč without a variable symbol');

export const PAYMENT_QR_1000 = paymentQr('1 000 Kč without a variable symbol');

export const PAYMENT_QR_500_WITH_SYMBOL = paymentQr('500 Kč with a ten-digit variable symbol');

export const ACCOUNT_VERIFICATION_QR = paymentQr("1 Kč verifying a donor's account");

export const FOUNDATION_PAYMENT_DETAILS = paymentDetailsOf("the foundation's account");

export async function drawnModulesMatch(
  qrCode: Locator,
  matrix: QrMatrixFixture,
): Promise<boolean> {
  return qrCode.evaluate((svg, { size, modules }) => {
    const dots = Array.from(svg.querySelectorAll('circle.qr-dot'));
    return (
      dots.length > 0 &&
      dots.every((dot) => {
        const column = Number(dot.getAttribute('cx')) - 4.5;
        const row = Number(dot.getAttribute('cy')) - 4.5;
        const dark = modules[row * size + column] === '1';
        return dark !== dot.classList.contains('is-off');
      })
    );
  }, matrix);
}
