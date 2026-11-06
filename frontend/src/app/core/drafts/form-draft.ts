import {
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  type Signal,
  signal,
  untracked,
} from '@angular/core';
import type { StoredDraft } from '../device/store/account-store';
import { DRAFT_KEEP_DELAY_MS, DRAFT_SHELF, type DraftCopy } from './draft-shelf';

export interface DraftOffer {
  readonly savedAt: string;
  readonly stale: boolean;
}

export interface FormDraftOptions<V> {
  readonly copy: DraftCopy;
  readonly key: () => string | null;
  readonly values: () => V;
  readonly apply: (values: V) => void;
}

const VERSION_BASE = 'version:';
const VALUES_BASE = 'values:';

export class FormDraft<V> {
  private readonly shelf = inject(DRAFT_SHELF);
  private readonly delayMs = inject(DRAFT_KEEP_DELAY_MS);
  private readonly offered = signal<DraftOffer | null>(null);
  private readonly resumedStaleDraft = signal(false);
  private readonly base = signal<{ readonly key: string; readonly base: string } | null>(null);
  private baseValues: string | null = null;
  private found: StoredDraft | null = null;
  private resumedBase: string | null = null;
  private keptKey: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private work: Promise<void> = Promise.resolve();
  private generation = 0;
  private stopped = false;

  readonly offer: Signal<DraftOffer | null> = this.offered.asReadonly();
  readonly resumedStale: Signal<boolean> = this.resumedStaleDraft.asReadonly();

  constructor(private readonly options: FormDraftOptions<V>) {
    const destroyRef = inject(DestroyRef);
    const host = inject(ElementRef, { optional: true })?.nativeElement as HTMLElement | undefined;
    const document = inject(DOCUMENT);
    const edited = () => this.changed();
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        void this.flush();
      }
    };
    const leaving = () => void this.flush();
    host?.addEventListener('input', edited, true);
    host?.addEventListener('change', edited, true);
    document.addEventListener('visibilitychange', hidden);
    document.defaultView?.addEventListener('pagehide', leaving);
    destroyRef.onDestroy(() => {
      host?.removeEventListener('input', edited, true);
      host?.removeEventListener('change', edited, true);
      document.removeEventListener('visibilitychange', hidden);
      document.defaultView?.removeEventListener('pagehide', leaving);
      void this.flush().then(() => (this.stopped = true));
    });
    effect(() => {
      const based = this.base();
      if (based !== null && this.shelf.open(this.options.copy)) {
        untracked(() => this.lookUp(based.key, based.base));
      }
    });
  }

  ready(version?: string | null): void {
    const key = this.options.key();
    if (key === null || this.stopped) {
      return;
    }
    const snapshot = stableJson(this.options.values());
    this.baseValues = snapshot;
    const generation = ++this.generation;
    const based = (base: string) => {
      if (generation === this.generation) {
        this.base.set({ key, base });
      }
    };
    if (version !== undefined && version !== null && version !== '') {
      based(`${VERSION_BASE}${version}`);
    } else {
      void digestOf(snapshot).then((digest) => based(`${VALUES_BASE}${digest}`));
    }
  }

  changed(): void {
    if (this.stopped || this.offered() !== null || this.base() === null) {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.keepNow();
    }, this.delayMs);
  }

  resume(): void {
    const found = this.found;
    const offer = this.offered();
    if (found === null || offer === null) {
      return;
    }
    this.found = null;
    this.resumedBase = found.base;
    this.keptKey = found.key;
    this.offered.set(null);
    this.resumedStaleDraft.set(offer.stale);
    this.options.apply(structuredClone(found.values) as V);
  }

  discard(): void {
    const key = this.found?.key ?? this.keptKey ?? this.base()?.key ?? null;
    this.cancelTimer();
    this.found = null;
    this.resumedBase = null;
    this.keptKey = null;
    this.offered.set(null);
    this.resumedStaleDraft.set(false);
    if (key !== null) {
      this.queue(() => this.shelf.drop(this.options.copy, key));
    }
  }

  saved(version?: string | null): void {
    this.discard();
    this.ready(version);
  }

  left(): void {
    this.discard();
    this.stopped = true;
  }

  overwriteConfirmed(): void {
    this.resumedStaleDraft.set(false);
  }

  staleVersion(): string | null {
    const base = this.resumedBase;
    return this.resumedStaleDraft() && base !== null && base.startsWith(VERSION_BASE)
      ? base.slice(VERSION_BASE.length)
      : null;
  }

  flush(): Promise<void> {
    if (this.timer !== null) {
      this.cancelTimer();
      void this.keepNow();
    }
    return this.work;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private keepNow(): Promise<void> {
    const based = this.base();
    const key = this.options.key();
    if (this.stopped || based === null || key === null || this.offered() !== null) {
      return this.work;
    }
    const snapshot = stableJson(this.options.values());
    if (snapshot === this.baseValues) {
      const kept = this.keptKey;
      this.keptKey = null;
      this.resumedBase = null;
      this.resumedStaleDraft.set(false);
      if (kept !== null) {
        this.queue(() => this.shelf.drop(this.options.copy, kept));
      }
      return this.work;
    }
    const draft: StoredDraft = {
      key,
      base: this.resumedBase ?? based.base,
      values: JSON.parse(snapshot) as unknown,
      savedAt: new Date().toISOString(),
    };
    const previous = this.keptKey;
    this.keptKey = key;
    this.queue(async () => {
      if (previous !== null && previous !== key) {
        await this.shelf.drop(this.options.copy, previous);
      }
      await this.shelf.keep(this.options.copy, draft);
    });
    return this.work;
  }

  private lookUp(key: string, base: string): void {
    const generation = this.generation;
    this.queue(async () => {
      if (this.keptKey === key) {
        return;
      }
      const found = (await this.shelf.list(this.options.copy)).find((draft) => draft.key === key);
      if (generation !== this.generation || this.stopped || found === undefined) {
        return;
      }
      if (stableJson(found.values) === this.baseValues) {
        await this.shelf.drop(this.options.copy, key);
        return;
      }
      this.cancelTimer();
      this.found = found;
      this.offered.set({ savedAt: found.savedAt, stale: found.base !== base });
    });
  }

  private queue(work: () => Promise<void>): void {
    this.work = this.work.then(work).catch(() => undefined);
  }
}

export function formDraft<V>(options: FormDraftOptions<V>): FormDraft<V> {
  return new FormDraft(options);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sorted(value));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

async function digestOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
