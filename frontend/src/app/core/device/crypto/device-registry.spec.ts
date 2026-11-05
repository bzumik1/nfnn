import { generateSessionKey, OpenCopy } from './copy-keys';
import { base64UrlToBytes, bytesToBase64Url, utf8 } from './device-bytes';
import {
  lookupTag,
  mayWrapWithPassword,
  newDeviceSalt,
  registryEntry,
  userHandleTag,
} from './device-registry';

const EMAIL = 'Jana.Novakova@Example.cz';
const COPY_ID = bytesToBase64Url(new Uint8Array(16).fill(0x11));
const DEVICE_SALT = bytesToBase64Url(new Uint8Array(32).fill(0x22));
const ROOT = new Uint8Array(32).fill(0x33);

describe('Given the plaintext registry of device copies', () => {
  afterEach(() => vi.restoreAllMocks());

  it('when a device salt is made, then it is 32 random bytes', () => {
    expect(base64UrlToBytes(newDeviceSalt())).toHaveLength(32);
    expect(newDeviceSalt()).not.toBe(newDeviceSalt());
  });

  it('when an e-mail is tagged, then case and surrounding spaces do not matter but the device salt does', async () => {
    const salt = newDeviceSalt();

    const tag = await lookupTag(salt, EMAIL);

    expect(await lookupTag(salt, '  jana.novakova@example.cz ')).toBe(tag);
    expect(await lookupTag(salt, 'petr@example.cz')).not.toBe(tag);
    expect(await lookupTag(newDeviceSalt(), EMAIL)).not.toBe(tag);
    expect(base64UrlToBytes(tag)).toHaveLength(32);
  });

  it('when a passkey user handle is tagged, then the tag differs per device and from the handle', async () => {
    const salt = newDeviceSalt();
    const handle = bytesToBase64Url(new Uint8Array(16).fill(6));

    const tag = await userHandleTag(salt, handle);

    expect(await userHandleTag(salt, handle)).toBe(tag);
    expect(await userHandleTag(newDeviceSalt(), handle)).not.toBe(tag);
    expect(tag).not.toBe(handle);
  });

  it('when an entry is written, then it holds no e-mail, part of it or user handle in any readable form', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        if (array !== null) {
          new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(0x44);
        }
        return array;
      },
    );
    const copy = await OpenCopy.withRoot({ copyId: COPY_ID }, new Uint8Array(ROOT));
    const handle = bytesToBase64Url(new Uint8Array(16).fill(6));

    const entry = await registryEntry({
      copy,
      kind: 'donor',
      deviceSalt: DEVICE_SALT,
      email: EMAIL,
      userHandle: handle,
      wraps: [await copy.wrapWithPrf('Y3JlZA', new Uint8Array(32).fill(1))],
    });

    const stored = JSON.stringify(entry).toLowerCase();
    for (const readable of ['jana', 'novakova', 'example', EMAIL.toLowerCase()]) {
      expect(stored).not.toContain(readable);
      expect(stored).not.toContain(bytesToBase64Url(utf8(readable)).toLowerCase());
      expect(stored).not.toContain(btoa(readable).toLowerCase());
    }
    expect(stored).not.toContain(handle.toLowerCase());
    expect(Object.keys(entry).sort()).toEqual(
      ['copyId', 'kind', 'lookupTag', 'userHandleTag', 'wraps'].sort(),
    );
    expect(entry).toMatchObject({
      copyId: COPY_ID,
      kind: 'donor',
      lookupTag: await lookupTag(DEVICE_SALT, EMAIL),
      userHandleTag: await userHandleTag(DEVICE_SALT, handle),
    });
    expect(entry.wraps).toHaveLength(1);
  });

  it('when an entry is written without a passkey, then it has no user handle tag', async () => {
    const copy = await OpenCopy.create();

    const entry = await registryEntry({
      copy,
      kind: 'administration',
      deviceSalt: newDeviceSalt(),
      email: EMAIL,
      userHandle: null,
      wraps: [],
    });

    expect(entry.userHandleTag).toBeNull();
    expect(entry.kind).toBe('administration');
  });

  describe('when a copy is to get a password wrap', () => {
    it('then a donor copy may always have one', async () => {
      const copy = await OpenCopy.create();
      const prf = await copy.wrapWithPrf('Y3JlZA', new Uint8Array(32).fill(1));

      expect(mayWrapWithPassword('donor', [])).toBe(true);
      expect(mayWrapWithPassword('donor', [prf])).toBe(true);
    });

    it('then the administration copy may have one only while no passkey PRF wraps it', async () => {
      const copy = await OpenCopy.create();
      const prf = await copy.wrapWithPrf('Y3JlZA', new Uint8Array(32).fill(1));
      const session = await copy.wrapWithSessionKey(await generateSessionKey());

      expect(mayWrapWithPassword('administration', [])).toBe(true);
      expect(mayWrapWithPassword('administration', [session])).toBe(true);
      expect(mayWrapWithPassword('administration', [prf])).toBe(false);
    });
  });
});
