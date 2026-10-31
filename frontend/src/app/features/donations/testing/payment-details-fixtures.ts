import { sharedCases } from '../../../../testing/shared-cases';
import { PaymentDetails } from '../payment-details-api';

export const FOUNDATION_DETAILS_CASE = "the foundation's account";

export function foundationPaymentDetails(): PaymentDetails {
  const answer = sharedCases('payment/details.json').find(
    (detailsCase) => detailsCase.name === FOUNDATION_DETAILS_CASE,
  );
  if (answer === undefined) {
    throw new Error(`payment/details.json has no case named ${FOUNDATION_DETAILS_CASE}`);
  }
  return structuredClone(answer.expected) as PaymentDetails;
}

export function paymentQrCase(name: string): {
  readonly spayd: string;
  readonly size: number;
  readonly modules: string;
} {
  const qrCase = sharedCases('qr/payment.json').find((candidate) => candidate.name === name);
  if (qrCase === undefined) {
    throw new Error(`qr/payment.json has no case named ${name}`);
  }
  return {
    spayd: qrCase.input.spayd,
    size: qrCase.expected.size,
    modules: qrCase.expected.matrix.join(''),
  };
}
