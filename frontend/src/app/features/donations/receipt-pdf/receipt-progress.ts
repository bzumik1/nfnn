import { DownloadProgressState } from '../../../shared/ui/download-progress/download-progress';
import { ReceiptPdfEvent, ReceiptPdfPhase } from './receipt-pdf';

const STEPS_BEFORE_DRAWING = 2;
const STEPS_AFTER_DRAWING = 1;
const PHASE_STEPS: Readonly<Record<ReceiptPdfPhase, number>> = { data: 1, tools: 2, drawing: 2 };

export type ReceiptPhaseEvent = Extract<ReceiptPdfEvent, { readonly kind: 'phase' }>;

export function receiptPhaseProgress(event: ReceiptPhaseEvent): DownloadProgressState {
  const pages = Math.max(event.pages, 1);
  return {
    kind: 'running',
    step: PHASE_STEPS[event.phase] + Math.min(event.page, pages),
    steps: STEPS_BEFORE_DRAWING + pages + STEPS_AFTER_DRAWING,
    text: phaseText(event.phase),
    ...(event.phase === 'drawing' && event.page > 0 ? { detail: pageText(event.page) } : {}),
  };
}

export function finishedReceiptProgress(
  kind: 'ready' | 'done' | 'cancelled',
  text: string,
): DownloadProgressState {
  return { kind, step: 1, steps: 1, text };
}

export function savedReceiptText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.saved:Potvrzení ${fileName}:fileName: je stažené. Najdete ho ve stažených souborech.`;
}

export function readySingleReceiptText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.readySingle:Potvrzení ${fileName}:fileName: je připravené. Otevřete ho tlačítkem Otevřít PDF.`;
}

export function sharedReceiptText(fileName: string): string {
  return $localize`:@@donor.dashboard.receipt.shared:Potvrzení ${fileName}:fileName: jste předali z nabídky sdílení.`;
}

function phaseText(phase: ReceiptPdfPhase): string {
  switch (phase) {
    case 'data':
      return $localize`:@@donor.dashboard.receipt.phase.data:Připravujeme údaje potvrzení…`;
    case 'tools':
      return $localize`:@@donor.dashboard.receipt.phase.tools:Načítáme nástroje pro PDF…`;
    case 'drawing':
      return $localize`:@@donor.dashboard.receipt.phase.drawingPdf:Vytváříme PDF…`;
  }
}

function pageText(page: number): string {
  return $localize`:@@donor.dashboard.receipt.phase.page:Strana ${page}:page:`;
}
