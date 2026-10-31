/// <reference types="@angular/localize" />

import { ReceiptCaptions } from './receipt-document';

export function receiptCaptions(): ReceiptCaptions {
  return {
    verificationHeading: {
      cs: $localize`:@@donor.receipt.pdf.verificationHeading:Ověření potvrzení`,
      en: $localize`:@@donor.receipt.pdf.verificationHeadingEnglish:Verification`,
    },
    verificationText: {
      cs: $localize`:@@donor.receipt.pdf.verificationText:Načtěte kód telefonem a uvidíte, co fond podepsal.`,
      en: $localize`:@@donor.receipt.pdf.verificationTextEnglish:Scan the code with a phone to see what the foundation signed.`,
    },
    verificationAlt: $localize`:@@donor.receipt.pdf.verificationAlt:QR kód pro ověření potvrzení na nfnn.cz/overit`,
    signatureAlt: $localize`:@@donor.receipt.pdf.signatureAlt:Podpis`,
    portraitAlt: $localize`:@@donor.receipt.pdf.portraitAlt:Fotografie podepisujícího`,
  };
}
