import { PdfProgressState } from '../../../shared/ui/pdf-progress/pdf-progress';
import { ReceiptPdfEvent, ReceiptPdfPhase } from './receipt-pdf';

export type ReceiptPhaseEvent = Extract<ReceiptPdfEvent, { readonly kind: 'phase' }>;

export function receiptPhaseProgress(event: ReceiptPhaseEvent): PdfProgressState {
  return { kind: 'running', text: phaseText(event.phase, event.page) };
}

export function readyReceiptProgress(text: string): PdfProgressState {
  return {
    kind: 'ready',
    text,
    brief: $localize`:@@donor.dashboard.receipt.brief.ready:PDF je připravené`,
  };
}

export function savedReceiptProgress(fileName: string): PdfProgressState {
  return {
    kind: 'done',
    text: $localize`:@@donor.dashboard.receipt.saved:Potvrzení ${fileName}:fileName: je stažené. Najdete ho ve stažených souborech.`,
    brief: $localize`:@@donor.dashboard.receipt.brief.saved:PDF je stažené`,
  };
}

export function sharedReceiptProgress(fileName: string): PdfProgressState {
  return {
    kind: 'done',
    text: $localize`:@@donor.dashboard.receipt.shared:Potvrzení ${fileName}:fileName: jste předali z nabídky sdílení.`,
    brief: $localize`:@@donor.dashboard.receipt.brief.shared:PDF jste předali`,
  };
}

export function cancelledReceiptProgress(text: string): PdfProgressState {
  return {
    kind: 'cancelled',
    text,
    brief: $localize`:@@donor.dashboard.receipt.brief.cancelled:Příprava je zrušená`,
  };
}

export function readySingleReceiptText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.readySingle:Potvrzení ${fileName}:fileName: je připravené. Otevřete ho tlačítkem Otevřít PDF.`;
}

function phaseText(phase: ReceiptPdfPhase, page: number): string {
  switch (phase) {
    case 'data':
      return $localize`:@@donor.dashboard.receipt.phase.data:Připravujeme údaje potvrzení…`;
    case 'tools':
      return $localize`:@@donor.dashboard.receipt.phase.tools:Načítáme nástroje pro PDF…`;
    case 'drawing':
      return page > 0
        ? $localize`:@@donor.dashboard.receipt.phase.drawingPage:Vytváříme PDF… · strana ${page}:page:`
        : $localize`:@@donor.dashboard.receipt.phase.drawingPdf:Vytváříme PDF…`;
  }
}
