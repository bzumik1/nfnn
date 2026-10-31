import { TestBed } from '@angular/core/testing';
import { RECEIPT_KEY_STORAGE, ReceiptKeyStore } from './receipt-key-store';

const STORAGE_KEY = 'nfnn.receipt-keys';

const LIST = {
  foundation: { name: 'Nová naděje - nadační fond', companyIdentifier: '27278794' },
  keys: [
    {
      keyId: '21fe31df',
      algorithm: 'Ed25519',
      publicKey: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      status: 'active',
      registeredAt: '2026-11-13T11:00:00Z',
    },
  ],
};

const LATER_LIST = {
  ...LIST,
  keys: [
    {
      keyId: '39f713d0',
      algorithm: 'Ed25519',
      publicKey: 'PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw',
      status: 'active',
      registeredAt: '2026-11-14T11:00:00Z',
    },
  ],
};

function storeWith(storage: () => Storage): ReceiptKeyStore {
  TestBed.configureTestingModule({
    providers: [{ provide: RECEIPT_KEY_STORAGE, useValue: storage }],
  });
  return TestBed.inject(ReceiptKeyStore);
}

describe('Given the browser keeps the key list', () => {
  afterEach(() => localStorage.clear());

  it('when nothing is kept yet, then there is no list', async () => {
    expect(await storeWith(() => localStorage).stored()).toBeNull();
  });

  it('when a fetched list is kept, then it reads back as trusted keys', async () => {
    const store = storeWith(() => localStorage);

    store.replace(LIST);

    expect((await store.stored())?.keys.map((key) => key.keyId)).toEqual(['21fe31df']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(LIST);
  });

  it('when a later list is kept, then it replaces the earlier one entirely', async () => {
    const store = storeWith(() => localStorage);

    store.replace(LIST);
    store.replace(LATER_LIST);

    expect((await store.stored())?.keys.map((key) => key.keyId)).toEqual(['39f713d0']);
  });

  it('when what is kept is not JSON, then there is no list', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(await storeWith(() => localStorage).stored()).toBeNull();
  });
});

describe('Given a browser that refuses its storage', () => {
  const refusing = (): Storage => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };

  it('when the list is read or kept, then nothing fails and there is no list', async () => {
    const store = storeWith(refusing);

    expect(() => store.replace(LIST)).not.toThrow();
    expect(await store.stored()).toBeNull();
  });

  it('when the storage is full, then keeping the list fails quietly', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Quota exceeded.', 'QuotaExceededError');
      },
    } as unknown as Storage;

    expect(() => storeWith(() => full).replace(LIST)).not.toThrow();
  });
});
