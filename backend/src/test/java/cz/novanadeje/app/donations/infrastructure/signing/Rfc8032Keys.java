package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.ReceiptSigner;

import java.util.HexFormat;

public final class Rfc8032Keys {

    static final String TEST_1_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
    static final String TEST_1_SEED_BASE64 = "nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=";
    static final String TEST_1_PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
    static final String TEST_1_KEY_ID = "21fe31df";
    static final String TEST_1_SIGNATURE = "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
    static final String TEST_2_SEED = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
    static final String TEST_2_PUBLIC_KEY = "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
    static final String TEST_2_KEY_ID = "39f713d0";
    static final String TEST_2_MESSAGE = "72";
    static final String TEST_2_SIGNATURE = "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00";
    static final String TEST_3_SEED = "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7";
    static final String TEST_3_KEY_ID = "dac073e0";
    static final String TEST_1024_SEED = "f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5";
    static final String TEST_1024_KEY_ID = "91384c41";
    static final String TEST_SHA_ABC_SEED = "833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42";
    static final String TEST_SHA_ABC_PUBLIC_KEY = "ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf";
    static final String TEST_SHA_ABC_KEY_ID = "5f9b247e";
    static final String TEST_SHA_ABC_MESSAGE = "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f";
    static final String TEST_CTX_SEED = "0305334e381af78f141cb666f6199f57bc3495335a256a95bd2a55bf546663f6";
    static final String TEST_CTX_KEY_ID = "c07ba992";
    static final String TEST_SHA_ABC_SIGNATURE = "dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b58909351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704";

    private Rfc8032Keys() {
    }

    static Ed25519ReceiptSigner test1() {
        return Ed25519ReceiptSigner.fromSeed(HexFormat.of().parseHex(TEST_1_SEED));
    }

    public static ReceiptSigner test1Signer() {
        return test1();
    }

    static Ed25519ReceiptSigner test2() {
        return Ed25519ReceiptSigner.fromSeed(HexFormat.of().parseHex(TEST_2_SEED));
    }

    static Ed25519ReceiptSigner testShaAbc() {
        return Ed25519ReceiptSigner.fromSeed(HexFormat.of().parseHex(TEST_SHA_ABC_SEED));
    }
}
