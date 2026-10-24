import { DialogHistoryListener } from '../dialog-history';

export class FakeDialogHistory {
  listener: DialogHistoryListener | null = null;
  steps: number[] = [];
  handedOver: string[] = [];
  closed = 0;
  released = 0;

  open(listener: DialogHistoryListener): void {
    this.listener = listener;
  }

  showStep(depth: number): void {
    if (this.steps.at(-1) !== depth) {
      this.steps.push(depth);
    }
  }

  close(): void {
    this.listener = null;
    this.closed++;
  }

  handOver(url: string): void {
    this.listener = null;
    this.handedOver.push(url);
  }

  release(): void {
    this.listener = null;
    this.released++;
  }
}
