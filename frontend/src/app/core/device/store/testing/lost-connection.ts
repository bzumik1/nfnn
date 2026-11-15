export type Reopening = 'works' | 'fails';

export class LostConnections {
  private readonly connections: IDBDatabase[] = [];
  private reopening: Reopening = 'works';
  opens = 0;

  constructor(factory: IDBFactory) {
    const open = factory.open.bind(factory);
    factory.open = (name: string, version?: number) => {
      this.opens++;
      if (this.reopening === 'fails') {
        throw lostConnection();
      }
      const request = open(name, version);
      request.addEventListener('success', () => this.connections.push(request.result));
      return request;
    };
  }

  lose(reopening: Reopening = 'works'): void {
    this.reopening = reopening;
    for (const connection of this.connections.splice(0)) {
      loseConnection(connection);
    }
  }

  closeQuietly(): void {
    for (const connection of this.connections.splice(0)) {
      connection.close();
    }
  }

  reopenWorks(): void {
    this.reopening = 'works';
  }
}

export class UnhandledRejections {
  readonly reasons: unknown[] = [];
  private readonly listener = (reason: unknown) => this.reasons.push(reason);

  constructor() {
    nodeProcess().on('unhandledRejection', this.listener);
  }

  async settled(): Promise<readonly unknown[]> {
    for (let turn = 0; turn < 3; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return this.reasons;
  }

  stop(): void {
    nodeProcess().off('unhandledRejection', this.listener);
  }
}

interface NodeProcess {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
}

function nodeProcess(): NodeProcess {
  return (globalThis as unknown as { process: NodeProcess }).process;
}

function lostConnection(): DOMException {
  return new DOMException(
    'Connection to Indexed Database server lost. Refresh the page to try again',
    'UnknownError',
  );
}

function loseConnection(connection: IDBDatabase): void {
  const transaction = connection.transaction.bind(connection);
  connection.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
    const opened = transaction(...args);
    const objectStore = opened.objectStore.bind(opened);
    opened.objectStore = (name: string) => failingSource(objectStore(name), opened);
    return opened;
  }) as IDBDatabase['transaction'];
}

function failingSource<Source extends object>(source: Source, transaction: IDBTransaction): Source {
  return new Proxy(source, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => {
        const result: unknown = value.apply(target, args);
        if (result instanceof IDBIndex) {
          return failingSource(result, transaction);
        }
        if (result instanceof IDBRequest) {
          failRequest(result, transaction);
        }
        return result;
      };
    },
  });
}

function failRequest(request: IDBRequest, transaction: IDBTransaction): void {
  const failure = lostConnection();
  Object.defineProperty(request, 'error', {
    configurable: true,
    get: () => failure,
    set: () => undefined,
  });
  transaction.abort();
}
