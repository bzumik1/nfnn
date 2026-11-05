import type { TabLocks } from '../../../auth/session-tabs';
import type { CopyChannel, CopyChannelFactory } from '../device-vault';

export class NamedLocks implements TabLocks {
  readonly requested: string[] = [];
  private readonly tails = new Map<string, Promise<unknown>>();

  request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    maybeCallback?: LockGrantedCallback<T>,
  ): Promise<Awaited<T>> {
    const callback = (
      typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
    ) as LockGrantedCallback<T>;
    this.requested.push(name);
    const granted = (this.tails.get(name) ?? Promise.resolve()).then(() =>
      callback({ name, mode: 'exclusive' } as Lock),
    );
    this.tails.set(
      name,
      granted.catch(() => undefined),
    );
    return granted as Promise<Awaited<T>>;
  }
}

export class ChannelBus {
  readonly posted: { readonly name: string; readonly message: unknown }[] = [];
  private readonly open = new Set<BusChannel>();

  readonly factory: CopyChannelFactory = (name) => {
    const channel = new BusChannel(name, this);
    this.open.add(channel);
    return channel;
  };

  deliver(from: BusChannel, message: unknown): void {
    this.posted.push({ name: from.name, message });
    for (const channel of this.open) {
      if (channel !== from && channel.name === from.name) {
        channel.receive(structuredClone(message));
      }
    }
  }

  closed(channel: BusChannel): void {
    this.open.delete(channel);
  }

  openNames(): string[] {
    return [...this.open].map((channel) => channel.name);
  }
}

class BusChannel implements CopyChannel {
  private readonly listeners: ((event: MessageEvent) => void)[] = [];

  constructor(
    readonly name: string,
    private readonly bus: ChannelBus,
  ) {}

  postMessage(message: unknown): void {
    this.bus.deliver(this, message);
  }

  addEventListener(type: string, listener: unknown): void {
    if (type === 'message') {
      this.listeners.push(listener as (event: MessageEvent) => void);
    }
  }

  close(): void {
    this.bus.closed(this);
  }

  receive(message: unknown): void {
    for (const listener of this.listeners) {
      listener(new MessageEvent('message', { data: message }));
    }
  }
}
