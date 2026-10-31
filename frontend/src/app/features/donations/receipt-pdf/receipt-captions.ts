/// <reference types="@angular/localize" />

import { ReceiptCaptions } from './receipt-document';

export function receiptCaptions(): ReceiptCaptions {
  return {
    verificationHeading: {
      cs: $localize`:@@donor.receipt.pdf.verificationHeading:Ověření potvrzení`,
      en: 'Verification',
    },
    verificationText: {
      cs: $localize`:@@donor.receipt.pdf.verificationText:Načtěte kód telefonem nebo na něj klikněte. Ukáže, zda potvrzení platí.`,
      en: 'Scan the code or click it to see whether this confirmation is valid.',
    },
    verificationAlt: $localize`:@@donor.receipt.pdf.verificationAlt:QR kód pro ověření potvrzení na nfnn.cz/overit`,
    signatureAlt: $localize`:@@donor.receipt.pdf.signatureAlt:Podpis`,
    portraitAlt: $localize`:@@donor.receipt.pdf.portraitAlt:Fotografie podepisujícího`,
  };
}
