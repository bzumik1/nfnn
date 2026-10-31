import { ed25519Verifies, webCryptoEd25519Verifies } from './ed25519';
import { nobleEd25519Verifies } from './noble-ed25519';
import type { SignatureCheck } from './receipt-proof';

function bytesOfHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  bytes.forEach(
    (_, index) => (bytes[index] = Number.parseInt(hex.slice(2 * index, 2 * index + 2), 16)),
  );
  return bytes;
}

const RFC8032_TEST_1 = {
  publicKey: bytesOfHex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'),
  message: new Uint8Array(0),
  signature: bytesOfHex(
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  ),
};

const RFC8032_TEST_SHA_ABC = {
  publicKey: bytesOfHex('ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf'),
  message: bytesOfHex(
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  ),
  signature: bytesOfHex(
    'dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b58909351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704',
  ),
};

const SMALL_ORDER_KEY = {
  publicKey: bytesOfHex('0100000000000000000000000000000000000000000000000000000000000000'),
  message: new TextEncoder().encode('nfnn.cz/receipt/v1'),
  signature: bytesOfHex(
    '01000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  ),
};

const PATHS: readonly { readonly name: string; readonly verifies: SignatureCheck }[] = [
  { name: 'WebCrypto', verifies: webCryptoEd25519Verifies },
  { name: 'the @noble/curves fallback', verifies: nobleEd25519Verifies },
];

for (const path of PATHS) {
  describe(`Given the RFC 8032 test vectors, verified by ${path.name}`, () => {
    it('when test 1 is verified, then its signature holds', async () => {
      const { publicKey, message, signature } = RFC8032_TEST_1;

      expect(await path.verifies(publicKey, message, signature)).toBe(true);
    });

    it('when the key of TEST SHA(abc), whose x is odd, is verified, then its signature holds', async () => {
      const { publicKey, message, signature } = RFC8032_TEST_SHA_ABC;

      expect(await path.verifies(publicKey, message, signature)).toBe(true);
    });

    it('when the key is the small-order identity point with R the identity and S zero, which ZIP215 accepts, then the strict RFC 8032 check refuses it', async () => {
      const { publicKey, message, signature } = SMALL_ORDER_KEY;

      expect(await path.verifies(publicKey, message, signature)).toBe(false);
    });

    it('when one bit of the message of test 1 changed, then the signature does not hold', async () => {
      const { publicKey, signature } = RFC8032_TEST_1;

      expect(await path.verifies(publicKey, Uint8Array.of(1).slice(), signature)).toBe(false);
    });
  });
}

describe('Given a browser whose WebCrypto knows no Ed25519', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(
      new DOMException('Unrecognized name.', 'NotSupportedError'),
    );
  });

  it('when a signature is verified, then the @noble/curves fallback checks it', async () => {
    const { publicKey, message, signature } = RFC8032_TEST_SHA_ABC;

    expect(await ed25519Verifies(publicKey, message, signature)).toBe(true);
    expect(crypto.subtle.importKey).toHaveBeenCalled();
  });

  it('when a wrong signature is verified, then the fallback refuses it', async () => {
    const { publicKey, signature } = RFC8032_TEST_1;

    expect(await ed25519Verifies(publicKey, new Uint8Array(1), signature)).toBe(false);
  });
});

describe('Given a browser whose WebCrypto knows Ed25519', () => {
  it('when a signature is verified, then WebCrypto answers', async () => {
    const verify = vi.spyOn(crypto.subtle, 'verify');
    const { publicKey, message, signature } = RFC8032_TEST_1;

    expect(await ed25519Verifies(publicKey, message, signature)).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });
});
