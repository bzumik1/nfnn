import { DialogHistoryListener } from '../dialog-history';

export class FakeDialogHistory {
  listener: DialogHistoryListener | null = null;
  steps: number[] = [];
  handedOver: string[] = [];
  kept: string[] = [];
  closed = 0;
  released = 0;
  opened = 0;
  ownsEntry = true;

  open(listener: DialogHistoryListener): void {
    this.opened++;
    this.listener = listener;
  }

  showStep(depth: number, listener?: DialogHistoryListener): void {
    if (listener !== undefined && listener !== this.listener) {
      return;
    }
    if (this.steps.at(-1) !== depth) {
      this.steps.push(depth);
    }
  }

  close(listener?: DialogHistoryListener): void {
    if (listener !== undefined && listener !== this.listener) {
      return;
    }
    this.listener = null;
    this.closed++;
  }

  handOver(url: string): boolean {
    this.listener = null;
    this.handedOver.push(url);
    return this.ownsEntry;
  }

  keepStep(mark: string): void {
    this.listener = null;
    this.kept.push(mark);
  }

  release(): void {
    this.listener = null;
    this.released++;
  }
}
