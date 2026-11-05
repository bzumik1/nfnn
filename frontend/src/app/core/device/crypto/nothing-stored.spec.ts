import { generateSessionKey, OpenCopy, openWithPassword, openWithPrf } from './copy-keys';
import { utf8 } from './device-bytes';
import { lookupTag, newDeviceSalt, registryEntry } from './device-registry';
import { SmallArgon2Derivation } from './testing/password-key-derivations';

describe('Given a sign-in with "Cizí počítač, nic neukládat"', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('when the crypto core makes, seals, wraps and opens a copy in memory, then nothing is written to IndexedDB, Web Storage or a cookie (the store of 2.14 proves it for the whole sign-in)', async () => {
    const open = vi.fn();
    const deleteDatabase = vi.fn();
    vi.stubGlobal('indexedDB', { open, deleteDatabase });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');

    const derivation = new SmallArgon2Derivation();
    const copy = await OpenCopy.create();
    const sealed = await copy.sealRecord(
      { collection: 'donations', recordId: '2026', schemaVersion: 1 },
      utf8('{"gifts":[100]}'),
    );
    const passwordWrap = await copy.wrapWithPassword('heslo', derivation);
    const prfWrap = await copy.wrapWithPrf('Y3JlZA', new Uint8Array(32).fill(2));
    await copy.wrapWithSessionKey(await generateSessionKey());
    await openWithPassword(copy, passwordWrap, 'heslo', derivation);
    const reopened = await openWithPrf(copy, prfWrap, new Uint8Array(32).fill(2));
    await reopened.openRecord(
      { collection: 'donations', recordId: '2026', schemaVersion: 1 },
      sealed,
    );
    const salt = newDeviceSalt();
    await lookupTag(salt, 'jana@example.cz');
    await registryEntry({
      copy,
      kind: 'donor',
      deviceSalt: salt,
      email: 'jana@example.cz',
      userHandle: null,
      wraps: [prfWrap],
    });
    reopened.close();
    copy.close();

    expect(open).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });
});
