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
  readonly changedFieldsOnly?: boolean;
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
  private holder: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
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
      const holder = this.shelf.holder(this.options.copy);
      if (holder === null) {
        return;
      }
      untracked(() => {
        if (this.holder !== null && this.holder !== holder) {
          this.accountChanged();
          return;
        }
        this.holder = holder;
        if (based !== null) {
          this.lookUp(based.key, based.base);
        }
      });
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
        if (this.pending && this.timer === null) {
          this.keepAfter(0);
        }
      }
    };
    if (version !== undefined && version !== null && version !== '') {
      based(`${VERSION_BASE}${version}`);
    } else {
      this.base.set(null);
      this.queue(async () => based(`${VALUES_BASE}${await digestOf(snapshot)}`));
    }
  }

  changed(): void {
    if (this.stopped || this.offered() !== null || this.generation === 0) {
      return;
    }
    this.pending = true;
    if (this.timer === null) {
      this.keepAfter(0);
    }
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
    this.options.apply(structuredClone(this.whole(found.values)) as V);
  }

  discard(): void {
    const key = this.found?.key ?? this.keptKey ?? this.base()?.key ?? null;
    this.cancelTimer();
    this.found = null;
    this.resumedBase = null;
    this.keptKey = null;
    this.offered.set(null);
    this.resumedStaleDraft.set(false);
    const holder = this.holder;
    if (key !== null && holder !== null) {
      this.queue(() => this.shelf.drop(this.options.copy, holder, key));
    }
  }

  saved(version?: string | null): void {
    this.discard();
    this.ready(version);
  }

  rebased(version?: string | null): void {
    const based = this.base();
    if (this.stopped || based === null || this.offered() !== null || !version) {
      return;
    }
    this.resumedBase = null;
    this.resumedStaleDraft.set(false);
    this.base.set({ key: based.key, base: `${VERSION_BASE}${version}` });
    this.pending = true;
    if (this.timer === null) {
      this.keepAfter(0);
    }
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
    if (this.pending && this.base() !== null) {
      this.cancelTimer();
      void this.keepNow();
    }
    return this.work;
  }

  private keepAfter(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending && this.base() !== null) {
        this.pending = false;
        void this.keepNow();
        this.keepAfter(this.delayMs);
      }
    }, delayMs);
  }

  private cancelTimer(): void {
    this.pending = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private accountChanged(): void {
    this.cancelTimer();
    this.found = null;
    this.resumedBase = null;
    this.keptKey = null;
    this.holder = null;
    this.offered.set(null);
    this.resumedStaleDraft.set(false);
    this.stopped = true;
  }

  private currentHolder(): string | null {
    const now = this.shelf.holder(this.options.copy);
    if (this.holder !== null && now !== null && now !== this.holder) {
      this.accountChanged();
      return null;
    }
    return now !== null && now === this.holder ? now : null;
  }

  private keepNow(): Promise<void> {
    const based = this.base();
    const key = this.options.key();
    if (this.stopped || based === null || key === null || this.offered() !== null) {
      return this.work;
    }
    const holder = this.currentHolder();
    if (holder === null) {
      return this.work;
    }
    const snapshot = stableJson(this.options.values());
    if (snapshot === this.baseValues) {
      this.resumedBase = null;
      this.resumedStaleDraft.set(false);
      this.queue(async () => {
        const kept = this.keptKey;
        this.keptKey = null;
        if (kept !== null) {
          await this.shelf.drop(this.options.copy, holder, kept);
        }
      });
      return this.work;
    }
    const draft: StoredDraft = {
      key,
      base: this.resumedBase ?? based.base,
      values: this.kept(snapshot),
      savedAt: new Date().toISOString(),
    };
    this.queue(async () => {
      const previous = this.keptKey;
      if (previous !== null && previous !== key) {
        await this.shelf.drop(this.options.copy, holder, previous);
        this.keptKey = null;
      }
      if (this.offered() !== null || holder !== this.holder) {
        return;
      }
      if (await this.shelf.keep(this.options.copy, holder, draft)) {
        this.keptKey = key;
      }
    });
    return this.work;
  }

  private lookUp(key: string, base: string): void {
    const generation = this.generation;
    const holder = this.holder;
    if (holder === null) {
      return;
    }
    this.queue(async () => {
      if (this.keptKey === key) {
        return;
      }
      const found = (await this.shelf.list(this.options.copy, holder)).find(
        (draft) => draft.key === key,
      );
      if (
        generation !== this.generation ||
        this.stopped ||
        holder !== this.holder ||
        found === undefined
      ) {
        return;
      }
      if (stableJson(this.whole(found.values)) === this.baseValues) {
        await this.shelf.drop(this.options.copy, holder, key);
        return;
      }
      this.cancelTimer();
      this.found = found;
      this.offered.set({ savedAt: found.savedAt, stale: found.base !== base });
    });
  }

  private kept(snapshot: string): unknown {
    const values = JSON.parse(snapshot) as unknown;
    if (!this.options.changedFieldsOnly || !isRecord(values) || this.baseValues === null) {
      return values;
    }
    const base = JSON.parse(this.baseValues) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(values).filter(
        ([name, value]) => stableJson(value) !== stableJson(base[name]),
      ),
    );
  }

  private whole(values: unknown): unknown {
    if (!this.options.changedFieldsOnly || !isRecord(values) || this.baseValues === null) {
      return values;
    }
    const base = JSON.parse(this.baseValues) as unknown;
    return isRecord(base) ? { ...base, ...values } : values;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function digestOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
