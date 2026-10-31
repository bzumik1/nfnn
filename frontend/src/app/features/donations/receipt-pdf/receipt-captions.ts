/// <reference types="@angular/localize" />

import { ReceiptCaptions } from './receipt-document';

export function receiptCaptions(): ReceiptCaptions {
  return {
    verificationHeading: {
      cs: $localize`:@@donor.receipt.pdf.verificationHeading:Ověření potvrzení`,
      en: $localize`:@@donor.receipt.pdf.verificationHeadingEnglish:Verification`,
    },
    verificationText: {
      cs: $localize`:@@donor.receipt.pdf.verificationText:Kód ukáže, co fond podepsal.`,
      en: $localize`:@@donor.receipt.pdf.verificationTextEnglish:The code shows what the foundation signed.`,
    },
    verificationAlt: $localize`:@@donor.receipt.pdf.verificationAlt:QR kód pro ověření potvrzení na nfnn.cz/overit`,
    signatureAlt: $localize`:@@donor.receipt.pdf.signatureAlt:Podpis`,
    portraitAlt: $localize`:@@donor.receipt.pdf.portraitAlt:Fotografie podepisujícího`,
  };
}
