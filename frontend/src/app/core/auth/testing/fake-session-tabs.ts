import { SessionChannel, TabLocks } from '../session-tabs';

type Grant = () => void;

export class FakeTabLocks implements TabLocks {
  private held = false;
  private readonly waiting: Grant[] = [];
  readonly requested: string[] = [];

  get isHeld(): boolean {
    return this.held;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    maybeCallback?: LockGrantedCallback<T>,
  ): Promise<Awaited<T>> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = (
      typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
    ) as LockGrantedCallback<T>;
    this.requested.push(name);
    return new Promise<Awaited<T>>((resolve, reject) => {
      const grant: Grant = () => {
        this.held = true;
        Promise.resolve()
          .then(() => callback({ name, mode: 'exclusive' } as Lock))
          .then((value) => resolve(value as Awaited<T>), reject)
          .finally(() => this.releaseNext());
      };
      if (!this.held) {
        grant();
        return;
      }
      this.waiting.push(grant);
      options.signal?.addEventListener('abort', () => {
        const index = this.waiting.indexOf(grant);
        if (index >= 0) {
          this.waiting.splice(index, 1);
          reject(new DOMException('The lock request was aborted.', 'AbortError'));
        }
      });
    });
  }

  holdForAnotherTab(): () => void {
    let release: () => void = () => undefined;
    const held = new Promise<void>((done) => (release = done));
    void this.request('nfnn-refresh', {}, () => held);
    return release;
  }

  private releaseNext(): void {
    this.held = false;
    this.waiting.shift()?.();
  }
}

export class FakeSessionChannel implements SessionChannel {
  readonly posted: unknown[] = [];
  closed = false;
  private readonly listeners: ((event: MessageEvent) => void)[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(type: string, listener: unknown): void {
    if (type === 'message') {
      this.listeners.push(listener as (event: MessageEvent) => void);
    }
  }

  close(): void {
    this.closed = true;
  }

  deliverFromAnotherTab(message: unknown): void {
    for (const listener of this.listeners) {
      listener(new MessageEvent('message', { data: message }));
    }
  }
}
