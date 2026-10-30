export const PROOF_ADDRESS = 'https://nfnn.cz/overit#';
export const PROOF_TEXT_VERSION = '1';
const PROOF_PREFIX = PROOF_ADDRESS + PROOF_TEXT_VERSION;
const CHUNK_BYTES = 7;
const CHUNK_DIGITS = [0, 3, 5, 8, 10, 13, 15, 17];
const DIGITS = /^[0-9]+$/;
const FORMAT = 1;
const KEY_ID_OFFSET = 1;
const KEY_ID_BYTES = 4;
const FLAGS_OFFSET = KEY_ID_OFFSET + KEY_ID_BYTES;
const SIGNATURE_BYTES = 64;
const SHORTEST_PROOF = FLAGS_OFFSET + 1 + SIGNATURE_BYTES;
const DOMAIN_TAG = 'nfnn.cz/receipt/v1';
const COMPANY_IDENTIFIER = /^[0-9]{8}$/;
const YEARLY = 1;
const COMPANY = 1 << 1;
const REPLACES = 1 << 2;
const CZECH_POSTAL_CODE = 1 << 3;
const RESERVED = 0xf0;
const MAX_VARINT = 2n ** 53n;
const MAX_VARINT_SUM = 2 ** 53;
const MAX_VARINT_GROUPS = 8;
const FIRST_SERIAL = 1;
const LAST_SERIAL = 999_999;
const FIRST_YEAR = 2000;
const LARGEST_POSTAL_CODE = 99_999;
const LARGEST_COMPANY_IDENTIFIER = 99_999_999;
const EPOCH = Date.UTC(2000, 0, 1);
const DAY = 86_400_000;

export type ProofRejection =
  | 'not-a-proof'
  | 'digits'
  | 'truncated'
  | 'unknown-format'
  | 'unknown-key'
  | 'revoked-key'
  | 'bad-signature'
  | 'reserved-flags'
  | 'non-minimal-varint'
  | 'invalid-text'
  | 'invalid-value'
  | 'trailing-bytes'
  | 'total-mismatch';

export interface SignedGift {
  readonly receivedOn: string;
  readonly amountMinor: number;
}

export interface SignedDonor {
  readonly type: 'person' | 'company';
  readonly name: string;
  readonly street: string;
  readonly city: string;
  readonly postalCode: string;
  readonly companyIdentifier: string | null;
}

export interface SignedReceipt {
  readonly kind: 'single' | 'yearly';
  readonly number: string;
  readonly issuedOn: string;
  readonly year: number | null;
  readonly replaces: { readonly number: string; readonly issuedOn: string } | null;
  readonly donor: SignedDonor;
  readonly gifts: readonly SignedGift[];
  readonly totalMinor: number;
}

export interface ProofKey {
  readonly keyId: string;
  readonly publicKey: Uint8Array<ArrayBuffer>;
  readonly status: 'active' | 'revoked';
}

export type SignatureCheck = (
  publicKey: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
) => Promise<boolean>;

export interface ValidProof {
  readonly verdict: 'valid';
  readonly keyId: string;
  readonly receipt: SignedReceipt;
  readonly signedMessage: Uint8Array<ArrayBuffer>;
  readonly signature: Uint8Array<ArrayBuffer>;
}

export type ProofReading =
  ValidProof | { readonly verdict: 'rejected'; readonly reason: ProofRejection };

class InvalidProof extends Error {
  constructor(readonly reason: ProofRejection) {
    super(reason);
  }
}

export function proofBytes(text: string): Uint8Array<ArrayBuffer> {
  if (!text.startsWith(PROOF_PREFIX)) {
    throw new InvalidProof('not-a-proof');
  }
  const digits = text.slice(PROOF_PREFIX.length);
  const fullDigits = CHUNK_DIGITS[CHUNK_BYTES];
  const lastChunkBytes = CHUNK_DIGITS.indexOf(digits.length % fullDigits);
  if (!DIGITS.test(digits) || lastChunkBytes < 0) {
    throw new InvalidProof('digits');
  }
  const fullChunks = Math.floor(digits.length / fullDigits);
  const bytes = new Uint8Array(fullChunks * CHUNK_BYTES + lastChunkBytes);
  for (let chunk = 0; chunk < fullChunks; chunk++) {
    const from = chunk * fullDigits;
    writeChunk(bytes, chunk * CHUNK_BYTES, digits.slice(from, from + fullDigits), CHUNK_BYTES);
  }
  if (lastChunkBytes > 0) {
    writeChunk(
      bytes,
      fullChunks * CHUNK_BYTES,
      digits.slice(fullChunks * fullDigits),
      lastChunkBytes,
    );
  }
  return bytes;
}

export async function readReceiptProof(
  text: string,
  foundationCompanyIdentifier: string,
  keyOf: (keyId: string) => ProofKey | undefined,
  verifies: SignatureCheck,
): Promise<ProofReading> {
  try {
    const bytes = proofBytes(text);
    if (bytes.length === 0) {
      throw new InvalidProof('truncated');
    }
    if (bytes[0] !== FORMAT) {
      throw new InvalidProof('unknown-format');
    }
    if (bytes.length < SHORTEST_PROOF) {
      throw new InvalidProof('truncated');
    }
    const body = bytes.slice(0, bytes.length - SIGNATURE_BYTES);
    const signature = bytes.slice(body.length);
    const keyId = hexOf(body.slice(KEY_ID_OFFSET, FLAGS_OFFSET));
    const key = keyOf(keyId);
    if (key === undefined) {
      throw new InvalidProof('unknown-key');
    }
    if (key.status === 'revoked') {
      throw new InvalidProof('revoked-key');
    }
    const signedMessage = messageOf(foundationCompanyIdentifier, body);
    if (!(await verifies(key.publicKey, signedMessage, signature))) {
      throw new InvalidProof('bad-signature');
    }
    return { verdict: 'valid', keyId, receipt: parseBody(body), signedMessage, signature };
  } catch (failure: unknown) {
    if (failure instanceof InvalidProof) {
      return { verdict: 'rejected', reason: failure.reason };
    }
    throw failure;
  }
}

export async function statusDigest(proof: ValidProof): Promise<string> {
  const whole = new Uint8Array(proof.signedMessage.length + proof.signature.length);
  whole.set(proof.signedMessage);
  whole.set(proof.signature, proof.signedMessage.length);
  return hexOf(new Uint8Array(await crypto.subtle.digest('SHA-256', whole)));
}

export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function writeChunk(target: Uint8Array, at: number, digits: string, length: number): void {
  let value = BigInt(digits);
  if (value >= 2n ** BigInt(8 * length)) {
    throw new InvalidProof('digits');
  }
  for (let index = length - 1; index >= 0; index--) {
    target[at + index] = Number(value & 0xffn);
    value >>= 8n;
  }
}

function messageOf(foundationCompanyIdentifier: string, body: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!COMPANY_IDENTIFIER.test(foundationCompanyIdentifier)) {
    throw new Error(
      `The foundation's company identifier is eight digits: ${foundationCompanyIdentifier}`,
    );
  }
  const tag = new TextEncoder().encode(DOMAIN_TAG);
  const identifier = Number(foundationCompanyIdentifier);
  const message = new Uint8Array(tag.length + 1 + 4 + body.length);
  message.set(tag);
  new DataView(message.buffer).setUint32(tag.length + 1, identifier);
  message.set(body, tag.length + 1 + 4);
  return message;
}

class BodyReader {
  private static readonly TEXT = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  constructor(
    private readonly bytes: Uint8Array,
    private at: number,
  ) {}

  u8(): number {
    if (this.at >= this.bytes.length) {
      throw new InvalidProof('truncated');
    }
    return this.bytes[this.at++];
  }

  u16(): number {
    return this.u8() * 0x100 + this.u8();
  }

  u24(): number {
    return this.u8() * 0x10000 + this.u16();
  }

  u32(): number {
    return this.u8() * 0x1000000 + this.u24();
  }

  varint(): number {
    let value = 0n;
    for (let group = 0; ; group++) {
      if (group === MAX_VARINT_GROUPS) {
        throw new InvalidProof('invalid-value');
      }
      const next = this.u8();
      value |= BigInt(next & 0x7f) << BigInt(7 * group);
      if ((next & 0x80) === 0) {
        if (group > 0 && next === 0) {
          throw new InvalidProof('non-minimal-varint');
        }
        break;
      }
    }
    if (value >= MAX_VARINT) {
      throw new InvalidProof('invalid-value');
    }
    return Number(value);
  }

  text(): string {
    const length = this.varint();
    if (length > this.bytes.length - this.at) {
      throw new InvalidProof('truncated');
    }
    let text: string;
    try {
      text = BodyReader.TEXT.decode(this.bytes.subarray(this.at, this.at + length));
    } catch {
      throw new InvalidProof('invalid-text');
    }
    this.at += length;
    if (text === '' || text.normalize('NFC') !== text) {
      throw new InvalidProof('invalid-text');
    }
    return text;
  }

  atEnd(): boolean {
    return this.at === this.bytes.length;
  }
}

function parseBody(body: Uint8Array): SignedReceipt {
  const reader = new BodyReader(body, FLAGS_OFFSET);
  const flags = reader.u8();
  if ((flags & RESERVED) !== 0) {
    throw new InvalidProof('reserved-flags');
  }
  const yearly = (flags & YEARLY) !== 0;
  const serial = reader.u24();
  const issuedOn = dayOf(reader.u16());
  const number = numberOf(issuedOn, serial);
  const year = yearly ? yearOf(reader.u16()) : null;
  let replaces: SignedReceipt['replaces'] = null;
  if ((flags & REPLACES) !== 0) {
    const replacedSerial = reader.u24();
    const replacedOn = dayOf(reader.u16());
    replaces = { number: numberOf(replacedOn, replacedSerial), issuedOn: replacedOn };
  }
  const donor = donorOf(reader, flags);
  const count = reader.varint();
  if (count < 1 || (!yearly && count !== 1)) {
    throw new InvalidProof('invalid-value');
  }
  const gifts: SignedGift[] = [];
  let sum = 0;
  for (let index = 0; index < count; index++) {
    const gift = giftOf(reader, gifts, year);
    sum += gift.amountMinor;
    if (sum >= MAX_VARINT_SUM) {
      throw new InvalidProof('invalid-value');
    }
    gifts.push(gift);
  }
  const totalMinor = reader.varint();
  if (!reader.atEnd()) {
    throw new InvalidProof('trailing-bytes');
  }
  if (totalMinor !== sum) {
    throw new InvalidProof('total-mismatch');
  }
  return {
    kind: yearly ? 'yearly' : 'single',
    number,
    issuedOn,
    year,
    replaces,
    donor,
    gifts,
    totalMinor,
  };
}

function donorOf(reader: BodyReader, flags: number): SignedDonor {
  const name = reader.text();
  const street = reader.text();
  const city = reader.text();
  let postalCode: string;
  if ((flags & CZECH_POSTAL_CODE) !== 0) {
    const code = reader.u24();
    if (code > LARGEST_POSTAL_CODE) {
      throw new InvalidProof('invalid-value');
    }
    const digits = String(code).padStart(5, '0');
    postalCode = `${digits.slice(0, 3)} ${digits.slice(3)}`;
  } else {
    postalCode = reader.text();
  }
  let companyIdentifier: string | null = null;
  if ((flags & COMPANY) !== 0) {
    const identifier = reader.u32();
    if (identifier > LARGEST_COMPANY_IDENTIFIER) {
      throw new InvalidProof('invalid-value');
    }
    companyIdentifier = String(identifier).padStart(8, '0');
  }
  return {
    type: companyIdentifier === null ? 'person' : 'company',
    name,
    street,
    city,
    postalCode,
    companyIdentifier,
  };
}

function giftOf(
  reader: BodyReader,
  earlier: readonly SignedGift[],
  year: number | null,
): SignedGift {
  const receivedOn = dayOf(reader.u16());
  const amountMinor = reader.varint();
  const outOfOrder = earlier.length > 0 && receivedOn < earlier[earlier.length - 1].receivedOn;
  const outsideYear = year !== null && yearOfDay(receivedOn) !== year;
  if (amountMinor < 1 || outOfOrder || outsideYear) {
    throw new InvalidProof('invalid-value');
  }
  return { receivedOn, amountMinor };
}

function numberOf(issuedOn: string, serial: number): string {
  if (serial < FIRST_SERIAL || serial > LAST_SERIAL) {
    throw new InvalidProof('invalid-value');
  }
  return `${issuedOn.slice(0, 4)}-${String(serial).padStart(6, '0')}`;
}

function yearOf(value: number): number {
  if (value < FIRST_YEAR) {
    throw new InvalidProof('invalid-value');
  }
  return value;
}

function dayOf(days: number): string {
  return new Date(EPOCH + days * DAY).toISOString().slice(0, 10);
}

function yearOfDay(day: string): number {
  return Number(day.slice(0, 4));
}
