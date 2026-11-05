import { ReceiptPdfFailureReason } from '../../donations/receipt-pdf/receipt-pdf';

export const ISSUING_FAILED = $localize`:@@admin.yearlyReceipts.issuingFailed:Vystavování potvrzení se přerušilo. Vystavená potvrzení platí; zkuste to prosím znovu a budeme pokračovat tam, kde jsme skončili.`;
export const READ_FAILED = $localize`:@@admin.yearlyReceipts.readFailed:Podpis nebo portrét k potvrzením se nepodařilo načíst. Zkuste to prosím znovu.`;

const DRAWING_FAILED = $localize`:@@admin.yearlyReceipts.drawingFailed:PDF se v prohlížeči nepodařilo vytvořit. Zkuste to prosím znovu, případně v jiném prohlížeči.`;
const DRAWING_FAILURES: Readonly<Record<ReceiptPdfFailureReason, string>> = {
  'tools-missing': $localize`:@@admin.yearlyReceipts.toolsMissing:Nástroje pro PDF se nepodařilo načíst. Obnovte prosím stránku a zkuste to znovu; vystavená potvrzení zůstanou.`,
  fonts: DRAWING_FAILED,
  drawing: DRAWING_FAILED,
  image: $localize`:@@admin.yearlyReceipts.imageFailed:Podpis nebo portrét na potvrzeních se nepodařilo ověřit, a tak jsme PDF nevytvořili. Zkuste to prosím znovu.`,
  unprintable: $localize`:@@admin.yearlyReceipts.unprintable:Údaje některého potvrzení obsahují znak, který v PDF neumíme vytisknout, a tak jsme PDF nevytvořili. Napište prosím správci webu.`,
  style: $localize`:@@admin.yearlyReceipts.styleFailed:PDF teď kvůli chybě na webu nejde vytvořit. Motiv webu dává potvrzení vzhled, který neprojde kontrolou.`,
};

const SKIP_REASONS: Readonly<Record<string, string>> = {
  'donations/donor-erased': $localize`:@@admin.yearlyReceipts.skip.erased:osobní údaje dárce jsou vymazané, nové potvrzení nevystavujeme.`,
  'donations/donor-not-found': $localize`:@@admin.yearlyReceipts.skip.notFound:dárce jsme nenašli.`,
  'donations/yearly-receipt-not-available': $localize`:@@admin.yearlyReceipts.skip.noGift:za tento rok nemá žádný dar.`,
  'donations/receipt-replacement-in-browser-only': $localize`:@@admin.yearlyReceipts.skip.browserOnly:platné potvrzení jde nahradit jen ve správě webu v prohlížeči.`,
  'donations/receipt-issue-limit': $localize`:@@admin.yearlyReceipts.skip.limit:dárci jsme za posledních 24 hodin vydali nejvíc nových potvrzení, kolik za den vydáváme; zkuste to zítra.`,
  'donations/receipt-too-long': $localize`:@@admin.yearlyReceipts.skip.tooLong:potvrzení má příliš mnoho darů pro ověřovací QR kód.`,
};

const OTHER_SKIP = $localize`:@@admin.yearlyReceipts.skip.other:potvrzení se nepodařilo vystavit; zkuste to na kartě dárce.`;

export function skipReason(problem: string | null): string {
  return (problem === null ? undefined : SKIP_REASONS[problem]) ?? OTHER_SKIP;
}

export function drawingFailureText(reason: ReceiptPdfFailureReason): string {
  return DRAWING_FAILURES[reason];
}

export function bundleTitle(year: number): string {
  return $localize`:@@admin.yearlyReceipts.pdf.title:Roční potvrzení o darech za rok ${year}:year:`;
}

export function bundleFileName(year: number): string {
  return `potvrzeni-o-darech-${year}-hromadne.pdf`;
}
