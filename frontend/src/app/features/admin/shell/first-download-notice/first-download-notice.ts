import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Fold } from '../../../../shared/ui/fold/fold';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { ADMINISTRATION_LOCK, type FirstDownloadProgress } from '../administration-lock';

export const FIRST_DOWNLOAD_ENDING_AFTER_MS = 1000;
export const FIRST_DOWNLOAD_STORED_MS = 4000;

type Shown = 'progress' | 'stored' | 'failed';

@Component({
  selector: 'app-first-download-notice',
  imports: [Fold, NeedsConnection],
  templateUrl: './first-download-notice.html',
  styleUrl: './first-download-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstDownloadNotice {
  protected readonly lock = inject(ADMINISTRATION_LOCK);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly running = computed(() => this.lock.firstDownload() !== null);
  private readonly shown = signal<Shown | null>(null);
  protected readonly saysStored = signal(false);
  protected readonly view = computed(() => (this.lock.locked() ? null : this.shown()));
  protected readonly content = linkedSignal<Shown | null, Shown | null>({
    source: this.view,
    computation: (view, previous) => view ?? previous?.value ?? null,
  });
  protected readonly progress = linkedSignal<
    FirstDownloadProgress | null,
    FirstDownloadProgress | null
  >({
    source: this.lock.firstDownload,
    computation: (progress, previous) => progress ?? previous?.value ?? null,
  });
  readonly releasesFocus = output<void>();
  private startedAt: number | null = null;
  private retrying = false;

  constructor() {
    effect((onCleanup) => {
      const running = this.running();
      const end = this.lock.firstDownloadEnd();
      untracked(() => {
        if (running) {
          this.startedAt ??= performance.now();
          this.saysStored.set(false);
          if (this.shown() !== 'failed') {
            this.show('progress');
            return;
          }
          this.retrying = true;
          const timer = setTimeout(() => this.show('progress'), FIRST_DOWNLOAD_ENDING_AFTER_MS);
          onCleanup(() => clearTimeout(timer));
          return;
        }
        const startedAt = this.startedAt;
        const retried = this.retrying && this.shown() === 'failed';
        this.startedAt = null;
        this.retrying = false;
        const seen =
          startedAt !== null && performance.now() - startedAt >= FIRST_DOWNLOAD_ENDING_AFTER_MS;
        if (end === 'failed') {
          this.saysStored.set(false);
          this.show('failed');
          return;
        }
        if (end !== 'stored' || (!seen && !retried)) {
          this.saysStored.set(false);
          this.show(null);
          return;
        }
        this.saysStored.set(true);
        this.show(retried ? null : 'stored');
        const timer = setTimeout(() => {
          this.saysStored.set(false);
          this.show(null);
        }, FIRST_DOWNLOAD_STORED_MS);
        onCleanup(() => clearTimeout(timer));
      });
    });
  }

  protected retry(): void {
    this.lock.retryFirstDownload();
  }

  private show(next: Shown | null): void {
    if (this.shown() === 'failed' && next !== 'failed' && this.holdsFocus()) {
      this.releasesFocus.emit();
    }
    this.shown.set(next);
  }

  private holdsFocus(): boolean {
    const active = this.document.activeElement;
    return (
      active === null || active === this.document.body || this.host.nativeElement.contains(active)
    );
  }
}
