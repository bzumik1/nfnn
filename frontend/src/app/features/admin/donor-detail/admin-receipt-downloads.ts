import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, Subscription } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { DownloadedFile } from '../../donations/donations-api';
import { PdfDelivery } from '../../donations/receipt-pdf/pdf-delivery';
import {
  ReceiptPdf,
  ReceiptPdfEvent,
  ReceiptPdfFailure,
  ReceiptPdfFailureReason,
} from '../../donations/receipt-pdf/receipt-pdf';
import {
  finishedReceiptProgress,
  readySingleReceiptText,
  receiptPhaseProgress,
  savedReceiptText,
  sharedReceiptText,
} from '../../donations/receipt-pdf/receipt-progress';
import { ReceiptSource, ReceiptsApi } from '../../donations/receipt-pdf/receipts-api';
import { DownloadProgressState } from '../../../shared/ui/download-progress/download-progress';

interface DownloadTask {
  readonly progress: DownloadProgressState | null;
  readonly file: DownloadedFile | null;
  readonly failure: string | null;
}

const UNAUTHENTICATED = 'auth/unauthenticated';

class ReceiptNoLongerActive extends Error {}

const READ_FAILED = $localize`:@@admin.donorDetail.receiptPdf.readFailed:Potvrzení se nepodařilo načíst. Zkuste to prosím znovu.`;
const DRAWING_FAILED = $localize`:@@admin.donorDetail.receiptPdf.drawingFailed:PDF se v prohlížeči nepodařilo vytvořit. Zkuste to prosím znovu, případně v jiném prohlížeči.`;
const FAILURE_TEXTS: Readonly<Record<ReceiptPdfFailureReason, string>> = {
  'tools-missing': $localize`:@@admin.donorDetail.receiptPdf.toolsMissing:Nástroje pro PDF se nepodařilo načíst. Obnovte prosím stránku a stáhněte potvrzení znovu.`,
  fonts: DRAWING_FAILED,
  drawing: DRAWING_FAILED,
  image: $localize`:@@admin.donorDetail.receiptPdf.imageFailed:Podpis nebo portrét na potvrzení se nepodařilo ověřit, a tak jsme PDF nevytvořili. Zkuste to prosím znovu.`,
  unprintable: $localize`:@@admin.donorDetail.receiptPdf.unprintable:Údaje potvrzení obsahují znak, který v PDF neumíme vytisknout, a tak jsme PDF nevytvořili.`,
  style: $localize`:@@admin.donorDetail.receiptPdf.styleFailed:PDF teď kvůli chybě na webu nejde vytvořit. Motiv webu dává potvrzení vzhled, který neprojde kontrolou.`,
};
const CANCELLED = $localize`:@@admin.donorDetail.receiptPdf.cancelled:Přípravu PDF jste zrušili.`;

@Injectable()
export class AdminReceiptDownloads {
  private readonly receiptPdf = inject(ReceiptPdf);
  private readonly receiptsApi = inject(ReceiptsApi);
  private readonly delivery = inject(PdfDelivery);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tasks = signal<ReadonlyMap<string, DownloadTask>>(new Map());
  private readonly running = new Map<string, Subscription>();
  private sessionEnded: () => void = () => undefined;
  private receiptReplaced: (receiptId: string) => void = () => undefined;

  whenSessionEnds(handler: () => void): void {
    this.sessionEnded = handler;
  }

  whenReceiptReplaced(handler: (receiptId: string) => void): void {
    this.receiptReplaced = handler;
  }

  progress(receiptId: string): DownloadProgressState | null {
    return this.tasks().get(receiptId)?.progress ?? null;
  }

  failure(receiptId: string): string | null {
    return this.tasks().get(receiptId)?.failure ?? null;
  }

  drawing(receiptId: string): boolean {
    return this.tasks().get(receiptId)?.progress?.kind === 'running';
  }

  ready(receiptId: string): boolean {
    return (this.tasks().get(receiptId)?.file ?? null) !== null;
  }

  press(receiptId: string): void {
    if (this.running.has(receiptId)) {
      return;
    }
    const file = this.tasks().get(receiptId)?.file ?? null;
    if (file !== null) {
      this.open(receiptId, file);
      return;
    }
    this.dropFinishedTasks();
    this.setTask(receiptId, { progress: null, file: null, failure: null });
    const subscription = new Subscription();
    this.running.set(receiptId, subscription);
    subscription.add(
      this.receiptPdf
        .draw(this.activeReceipt(receiptId))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (event) => this.progressed(receiptId, event),
          error: (failure: unknown) => {
            this.running.delete(receiptId);
            this.failed(receiptId, failure);
          },
        }),
    );
  }

  cancel(receiptId: string): void {
    const subscription = this.running.get(receiptId);
    if (subscription === undefined) {
      return;
    }
    subscription.unsubscribe();
    this.running.delete(receiptId);
    this.setTask(receiptId, {
      progress: finishedReceiptProgress('cancelled', CANCELLED),
      file: null,
      failure: null,
    });
  }

  private activeReceipt(receiptId: string): ReceiptSource {
    const source = this.receiptsApi.administrationSource(receiptId);
    return {
      receipt: () =>
        source.receipt().pipe(
          map((issued) => {
            if (issued.status !== 'ACTIVE') {
              throw new ReceiptNoLongerActive();
            }
            return issued;
          }),
        ),
      image: (sha256) => source.image(sha256),
    };
  }

  private progressed(receiptId: string, event: ReceiptPdfEvent): void {
    if (event.kind === 'phase') {
      this.setTask(receiptId, { progress: receiptPhaseProgress(event), file: null, failure: null });
      return;
    }
    this.running.delete(receiptId);
    const file = event.file;
    if (this.delivery.needsSecondTap(file)) {
      this.setTask(receiptId, {
        progress: finishedReceiptProgress('ready', readySingleReceiptText(file.fileName)),
        file,
        failure: null,
      });
      return;
    }
    this.delivery.save(file);
    this.setTask(receiptId, {
      progress: finishedReceiptProgress('done', savedReceiptText(file.fileName)),
      file: null,
      failure: null,
    });
  }

  private open(receiptId: string, file: DownloadedFile): void {
    const task = this.tasks().get(receiptId);
    void this.delivery.share(file).then((outcome) => {
      if (this.tasks().get(receiptId) !== task) {
        return;
      }
      if (outcome === 'dismissed') {
        return;
      }
      if (outcome === 'failed') {
        this.delivery.save(file);
      }
      const text =
        outcome === 'shared' ? sharedReceiptText(file.fileName) : savedReceiptText(file.fileName);
      this.setTask(receiptId, {
        progress: finishedReceiptProgress('done', text),
        file: null,
        failure: null,
      });
    });
  }

  private failed(receiptId: string, failure: unknown): void {
    if (failure instanceof ReceiptNoLongerActive) {
      this.forget(receiptId);
      this.receiptReplaced(receiptId);
      return;
    }
    if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
      this.setTask(receiptId, { progress: null, file: null, failure: null });
      this.sessionEnded();
      return;
    }
    const text =
      failure instanceof ReceiptPdfFailure
        ? FAILURE_TEXTS[failure.reason]
        : describeProblem(failure, READ_FAILED);
    this.setTask(receiptId, { progress: null, file: null, failure: text });
  }

  private dropFinishedTasks(): void {
    this.tasks.update(
      (tasks) =>
        new Map(
          [...tasks].filter(
            ([receiptId, task]) => this.running.has(receiptId) || task.file !== null,
          ),
        ),
    );
  }

  private forget(receiptId: string): void {
    this.tasks.update((tasks) => {
      const remaining = new Map(tasks);
      remaining.delete(receiptId);
      return remaining;
    });
  }

  private setTask(receiptId: string, task: DownloadTask): void {
    this.tasks.update((tasks) => new Map(tasks).set(receiptId, task));
  }
}
