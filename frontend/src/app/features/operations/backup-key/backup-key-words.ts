import { bech32Decode, bech32Encode } from './bech32';
import { CZECH_WORDLIST } from './czech-wordlist';
import { sha256 } from './sha256';

export const BACKUP_KEY_WORD_COUNT = 24;

const HUMAN_READABLE_PART = 'age-secret-key-';
const KEY_PREFIX = `${HUMAN_READABLE_PART}1`;
const KEY_BYTES = 32;
const BITS_PER_WORD = 11;
const UNIQUE_PREFIX = 4;
const MAX_WORD_LENGTH = 40;
const LETTERS = /^[a-z]+$/;
const NOT_LETTERS = /[^a-z]+/;
const INDEX_BY_PREFIX = new Map(
  CZECH_WORDLIST.map((word, index) => [word.slice(0, UNIQUE_PREFIX), index]),
);

function plain(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

function wordIndex(typed: string): number | null {
  const word = plain(typed).trim();
  if (word.length < UNIQUE_PREFIX || word.length > MAX_WORD_LENGTH || !LETTERS.test(word)) {
    return null;
  }
  const index = INDEX_BY_PREFIX.get(word.slice(0, UNIQUE_PREFIX));
  return index !== undefined && CZECH_WORDLIST[index].startsWith(word) ? index : null;
}

function withChecksum(key: Uint8Array): Uint8Array {
  const bits = new Uint8Array(KEY_BYTES + 1);
  bits.set(key);
  bits[KEY_BYTES] = sha256(key)[0];
  return bits;
}

export function canonicalBackupKeyWord(typed: string): string | null {
  const index = wordIndex(typed);
  return index === null ? null : CZECH_WORDLIST[index];
}

export function backupKeyWords(key: string): string[] {
  const bytes = bech32Decode(key.trim(), HUMAN_READABLE_PART, KEY_BYTES);
  if (bytes === null) {
    return [];
  }
  const bits = withChecksum(bytes);
  return Array.from({ length: BACKUP_KEY_WORD_COUNT }, (_, word) => {
    let index = 0;
    for (let bit = 0; bit < BITS_PER_WORD; bit++) {
      const position = word * BITS_PER_WORD + bit;
      index = (index << 1) | ((bits[position >> 3] >>> (7 - (position & 7))) & 1);
    }
    return CZECH_WORDLIST[index];
  });
}

function keyFromWords(text: string): string | null {
  const typed = plain(text)
    .split(NOT_LETTERS)
    .filter((token) => token !== '');
  if (typed.length !== BACKUP_KEY_WORD_COUNT) {
    return null;
  }
  const bits = new Uint8Array(KEY_BYTES + 1);
  for (let word = 0; word < BACKUP_KEY_WORD_COUNT; word++) {
    const index = wordIndex(typed[word]);
    if (index === null) {
      return null;
    }
    for (let bit = 0; bit < BITS_PER_WORD; bit++) {
      if ((index >>> (BITS_PER_WORD - 1 - bit)) & 1) {
        const position = word * BITS_PER_WORD + bit;
        bits[position >> 3] |= 0x80 >>> (position & 7);
      }
    }
  }
  const key = bits.slice(0, KEY_BYTES);
  const expected = withChecksum(key);
  return expected[KEY_BYTES] === bits[KEY_BYTES]
    ? bech32Encode(HUMAN_READABLE_PART, key).toUpperCase()
    : null;
}

export function parseBackupKey(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.toLowerCase().startsWith(KEY_PREFIX)) {
    return bech32Decode(trimmed, HUMAN_READABLE_PART, KEY_BYTES) === null
      ? null
      : trimmed.toUpperCase();
  }
  return keyFromWords(text);
}
