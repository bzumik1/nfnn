import cases from '../../../../../../test-cases/backup-key-words.json';
import { backupKeyWords, canonicalBackupKeyWord, parseBackupKey } from './backup-key-words';
import { CZECH_WORDLIST } from './czech-wordlist';
import { sha256 } from './sha256';

const WORDLIST_SHA256 = '7e80e161c3e93d9554c2efb78d4e3cebf8fc727e9c52e03b83b94406bdcc95fc';

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Given the Czech wordlist of BIP39', () => {
  it('when it is hashed, then it is the published list the shared cases were made with', async () => {
    const text = new TextEncoder().encode(`${CZECH_WORDLIST.join('\n')}\n`);

    expect(CZECH_WORDLIST).toHaveLength(2048);
    expect(hex(await crypto.subtle.digest('SHA-256', text))).toBe(WORDLIST_SHA256);
    expect(cases.wordlistSha256).toBe(WORDLIST_SHA256);
  });
});

describe('Given the SHA-256 the word checksum is computed with', () => {
  it('when it hashes the test vectors of the standard and the wordlist, then it gives their digests', async () => {
    const encoder = new TextEncoder();
    const list = encoder.encode(`${CZECH_WORDLIST.join('\n')}\n`);

    expect(hex(sha256(new Uint8Array()))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(hex(sha256(encoder.encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      hex(sha256(encoder.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(hex(sha256(list))).toBe(hex(await crypto.subtle.digest('SHA-256', list)));
  });
});

describe('Given the keys of the shared cases', () => {
  for (const { key, words } of cases.keys) {
    it(`when ${key.slice(0, 22)}… is written as words, then it gives the 24 words of the case`, () => {
      expect(backupKeyWords(key)).toEqual(words);
    });

    it(`when the words of ${key.slice(0, 22)}… are read, then they give the key`, () => {
      expect(parseBackupKey(words.join(' '))).toBe(key);
    });
  }
});

describe('Given the typed words of the shared cases', () => {
  for (const { typed, word } of cases.typedWords) {
    it(`when "${typed}" is read, then it is ${word ?? 'no word'}`, () => {
      expect(canonicalBackupKeyWord(typed)).toBe(word);
    });
  }
});

describe('Given the pasted keys and words of the shared cases', () => {
  for (const { input, key } of cases.parse) {
    it(`when "${input.slice(0, 30).replace(/\s+/g, ' ')}…" is read, then it gives ${key === null ? 'no key' : 'the key of the case'}`, () => {
      expect(parseBackupKey(input)).toBe(key);
    });
  }
});

describe('Given a text that is not a key', () => {
  it('when it is written as words, then there are none', () => {
    expect(backupKeyWords('AGE-SECRET-KEY-1')).toEqual([]);
  });
});
