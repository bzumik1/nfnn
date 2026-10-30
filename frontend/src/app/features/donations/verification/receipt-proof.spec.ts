import { sharedCases, type VerificationKey } from '../../../../testing/shared-cases';
import { webCryptoEd25519Verifies } from './ed25519';
import { nobleEd25519Verifies } from './noble-ed25519';
import {
  type ProofKey,
  proofBytes,
  readReceiptProof,
  type SignatureCheck,
  statusDigest,
} from './receipt-proof';

const CASES = sharedCases('verification/payload.json');

const VERIFY_PATHS: readonly { readonly name: string; readonly verifies: SignatureCheck }[] = [
  { name: 'WebCrypto', verifies: webCryptoEd25519Verifies },
  { name: 'the @noble/curves fallback', verifies: nobleEd25519Verifies },
];

function bytesOfHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  bytes.forEach(
    (_, index) => (bytes[index] = Number.parseInt(hex.slice(2 * index, 2 * index + 2), 16)),
  );
  return bytes;
}

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function keysOf(keys: readonly VerificationKey[]): (keyId: string) => ProofKey | undefined {
  return (keyId) => {
    const key = keys.find((listed) => listed.keyId === keyId);
    return key === undefined
      ? undefined
      : { keyId: key.keyId, publicKey: bytesOfHex(key.publicKeyHex), status: key.status };
  };
}

describe('Given the shared verification proof cases', () => {
  it('when they are read, then there are encoding cases and reading cases to run', () => {
    expect(CASES.filter((sharedCase) => 'receipt' in sharedCase.input).length).toBeGreaterThan(10);
    expect(CASES.filter((sharedCase) => 'qrText' in sharedCase.input).length).toBeGreaterThan(30);
  });
});

for (const path of VERIFY_PATHS) {
  for (const sharedCase of CASES) {
    const { input, expected } = sharedCase;
    describe(`Given the shared case ${sharedCase.name}, verified by ${path.name}`, () => {
      if ('receipt' in input && 'payloadHex' in expected) {
        it('when its QR text is read against its keys, then it is valid with its key id and its receipt', async () => {
          const reading = await readReceiptProof(
            expected.qrText,
            input.foundation.companyIdentifier,
            keysOf(input.keys),
            path.verifies,
          );

          expect(reading).toEqual({
            verdict: 'valid',
            keyId: input.signingKeyId,
            receipt: input.receipt,
            signedMessage: expect.any(Uint8Array),
            signature: expect.any(Uint8Array),
          });
        });

        it('when its QR text is turned into bytes, then they are the body and the signature', () => {
          expect(hexOf(proofBytes(expected.qrText))).toBe(
            expected.payloadHex + expected.signatureHex,
          );
        });

        it('when its signed message and signature are hashed, then the digest is the one the status check sends', async () => {
          const reading = await readReceiptProof(
            expected.qrText,
            input.foundation.companyIdentifier,
            keysOf(input.keys),
            path.verifies,
          );

          expect(reading.verdict === 'valid' && (await statusDigest(reading))).toBe(
            expected.statusSha256,
          );
        });
      }
      if ('qrText' in input && 'verdict' in expected) {
        it(`when it is read, then the verdict is ${expected.verdict === 'valid' ? 'valid' : expected.reason}`, async () => {
          const reading = await readReceiptProof(
            input.qrText,
            input.foundation.companyIdentifier,
            keysOf(input.keys),
            path.verifies,
          );

          expect(reading).toEqual(
            expected.verdict === 'valid'
              ? {
                  verdict: 'valid',
                  keyId: expected.keyId,
                  receipt: expected.receipt,
                  signedMessage: expect.any(Uint8Array),
                  signature: expect.any(Uint8Array),
                }
              : expected,
          );
        });
      }
    });
  }
}

describe('Given a valid proof and a check that would accept any signature', () => {
  const valid = CASES.find((sharedCase) => sharedCase.name === 'a valid proof read back');
  const anySignature: SignatureCheck = () => Promise.resolve(true);

  function textWithBody(change: (bytes: Uint8Array) => Uint8Array): string {
    if (valid === undefined || !('qrText' in valid.input)) {
      throw new Error('the shared case "a valid proof read back" is missing');
    }
    const bytes = change(proofBytes(valid.input.qrText));
    const chunks: string[] = [];
    for (let at = 0; at < bytes.length; at += 7) {
      const chunk = bytes.slice(at, at + 7);
      const value = chunk.reduce((sum, byte) => sum * 256n + BigInt(byte), 0n);
      chunks.push(value.toString().padStart([0, 3, 5, 8, 10, 13, 15, 17][chunk.length], '0'));
    }
    return `https://nfnn.cz/overit#1${chunks.join('')}`;
  }

  function withName(name: Uint8Array): (bytes: Uint8Array) => Uint8Array {
    return (bytes) => {
      const nameAt = 1 + 4 + 1 + 3 + 2;
      const oldLength = bytes[nameAt];
      return Uint8Array.from([
        ...bytes.slice(0, nameAt),
        name.length,
        ...name,
        ...bytes.slice(nameAt + 1 + oldLength),
      ]);
    };
  }

  async function reasonFor(text: string): Promise<string> {
    const reading = await readReceiptProof(
      text,
      '27278794',
      () => ({ keyId: '21fe31df', publicKey: new Uint8Array(32), status: 'active' }),
      anySignature,
    );
    return reading.verdict === 'rejected' ? reading.reason : reading.verdict;
  }

  it('when the name is not UTF-8, then the text is refused', async () => {
    expect(await reasonFor(textWithBody(withName(Uint8Array.from([0x4d, 0xff, 0x61]))))).toBe(
      'invalid-text',
    );
  });

  it('when the name is UTF-8 written with an overlong sequence, then the text is refused', async () => {
    expect(await reasonFor(textWithBody(withName(Uint8Array.from([0xc0, 0xaf]))))).toBe(
      'invalid-text',
    );
  });

  it('when the name holds a surrogate written in three bytes, then the text is refused', async () => {
    expect(await reasonFor(textWithBody(withName(Uint8Array.from([0xed, 0xa0, 0x80]))))).toBe(
      'invalid-text',
    );
  });

  it('when the name is not in NFC, then the text is refused', async () => {
    expect(await reasonFor(textWithBody(withName(new TextEncoder().encode('Maríe'))))).toBe(
      'invalid-text',
    );
  });

  it('when the name is empty, then the text is refused', async () => {
    expect(await reasonFor(textWithBody(withName(new Uint8Array(0))))).toBe('invalid-text');
  });

  it('when the serial is zero, then the value is refused', async () => {
    expect(
      await reasonFor(
        textWithBody((bytes) =>
          Uint8Array.from([...bytes.slice(0, 6), 0, 0, 0, ...bytes.slice(9)]),
        ),
      ),
    ).toBe('invalid-value');
  });
});
