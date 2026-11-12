export const OWN_HISTORY_KEY = 'nfnn.app-history';
export const OWN_HISTORY_LIMIT = 50;

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Entry {
  readonly state: unknown;
  readonly url: string;
}

const OWN_METHODS = ['pushState', 'replaceState', 'back', 'forward', 'go'] as const;

const NOTHING_KEPT: HistoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
};

export function installOwnHistoryIn(view: Window): () => void {
  return installOwnHistory(view, sessionStorageOf(view));
}

export function installOwnHistory(view: Window, storage: HistoryStorage): () => void {
  const history = view.history;
  const replaceInBrowser = history.replaceState.bind(history);
  const entries = restored(storage, view.location.href) ?? [
    { state: history.state, url: view.location.href },
  ];
  let pending = 0;

  const keep = (): void => {
    entries.splice(0, Math.max(0, entries.length - OWN_HISTORY_LIMIT));
    try {
      storage.setItem(OWN_HISTORY_KEY, JSON.stringify(entries));
    } catch {
      return;
    }
  };

  const write = (state: unknown, url?: string | URL | null): Entry => {
    replaceInBrowser(state, '', url);
    return { state, url: view.location.href };
  };

  const goBack = (steps: number): void => {
    const reachable = Math.min(steps, entries.length - 1 - pending);
    if (reachable <= 0) {
      return;
    }
    pending += reachable;
    view.setTimeout(() => {
      pending -= reachable;
      entries.splice(entries.length - reachable, reachable);
      const target = entries[entries.length - 1];
      replaceInBrowser(target.state, '', target.url);
      keep();
      view.dispatchEvent(new PopStateEvent('popstate', { state: target.state }));
    });
  };

  const own: Pick<History, (typeof OWN_METHODS)[number]> = {
    pushState: (state, _unused, url) => {
      entries.push(write(state, url));
      keep();
    },
    replaceState: (state, _unused, url) => {
      entries[entries.length - 1] = write(state, url);
      keep();
    },
    back: () => goBack(1),
    forward: () => undefined,
    go: (delta = 0) => {
      if (delta === 0) {
        view.location.reload();
      } else if (delta < 0) {
        goBack(-delta);
      }
    },
  };
  for (const method of OWN_METHODS) {
    Object.defineProperty(history, method, {
      configurable: true,
      writable: true,
      value: own[method],
    });
  }
  keep();

  return () => {
    for (const method of OWN_METHODS) {
      delete (history as Partial<History>)[method];
    }
  };
}

function sessionStorageOf(view: Window): HistoryStorage {
  try {
    return view.sessionStorage;
  } catch {
    return NOTHING_KEPT;
  }
}

function restored(storage: HistoryStorage, url: string): Entry[] | null {
  try {
    const kept: unknown = JSON.parse(storage.getItem(OWN_HISTORY_KEY) ?? 'null');
    if (!Array.isArray(kept) || kept.length === 0 || !kept.every(isEntry)) {
      return null;
    }
    return kept[kept.length - 1].url === url ? kept : null;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is Entry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { url?: unknown }).url === 'string'
  );
}
