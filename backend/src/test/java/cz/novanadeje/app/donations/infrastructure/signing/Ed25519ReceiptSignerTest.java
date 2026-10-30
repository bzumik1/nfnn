package cz.novanadeje.app.donations.infrastructure.signing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class Ed25519ReceiptSignerTest {

    private static final HexFormat HEX = HexFormat.of();

    @Test
    @DisplayName("Given the seed of RFC 8032 test 1, when it signs the empty message, then it gives the RFC's public key and signature")
    void should_give_rfc_public_key_and_signature_when_signing_given_rfc_test_1_seed() {
        Ed25519ReceiptSigner signer = Rfc8032Keys.test1();

        assertThat(HEX.formatHex(signer.publicKey())).isEqualTo(Rfc8032Keys.TEST_1_PUBLIC_KEY);
        assertThat(signer.keyId().value()).isEqualTo(Rfc8032Keys.TEST_1_KEY_ID);
        assertThat(HEX.formatHex(signer.sign(new byte[0]))).isEqualTo(Rfc8032Keys.TEST_1_SIGNATURE);
    }

    @Test
    @DisplayName("Given the seed of RFC 8032 test 2, when it signs the one-byte message, then it gives the RFC's public key and signature")
    void should_give_rfc_public_key_and_signature_when_signing_given_rfc_test_2_seed() {
        Ed25519ReceiptSigner signer = Rfc8032Keys.test2();

        assertThat(HEX.formatHex(signer.publicKey())).isEqualTo(Rfc8032Keys.TEST_2_PUBLIC_KEY);
        assertThat(signer.keyId().value()).isEqualTo(Rfc8032Keys.TEST_2_KEY_ID);
        assertThat(HEX.formatHex(signer.sign(HEX.parseHex(Rfc8032Keys.TEST_2_MESSAGE)))).isEqualTo(Rfc8032Keys.TEST_2_SIGNATURE);
    }

    @Test
    @DisplayName("Given the seed of RFC 8032 test SHA(abc), whose public key has an odd x, when it signs the RFC's message, then it gives the RFC's public key and signature, which verify")
    void should_give_rfc_public_key_and_signature_when_signing_given_rfc_sha_abc_seed_with_odd_x() {
        Ed25519ReceiptSigner signer = Rfc8032Keys.testShaAbc();
        byte[] message = HEX.parseHex(Rfc8032Keys.TEST_SHA_ABC_MESSAGE);

        assertThat(HEX.formatHex(signer.publicKey())).isEqualTo(Rfc8032Keys.TEST_SHA_ABC_PUBLIC_KEY);
        assertThat(signer.keyId().value()).isEqualTo(Rfc8032Keys.TEST_SHA_ABC_KEY_ID);
        assertThat(HEX.formatHex(signer.sign(message))).isEqualTo(Rfc8032Keys.TEST_SHA_ABC_SIGNATURE);
        assertThat(signer.verifies(signer.publicKey(), message, HEX.parseHex(Rfc8032Keys.TEST_SHA_ABC_SIGNATURE))).isTrue();
    }

    @Test
    @DisplayName("Given one seed, when it signs the same message twice, then both signatures are the same")
    void should_sign_deterministically_when_signing_twice_given_one_seed() {
        Ed25519ReceiptSigner signer = Rfc8032Keys.test1();
        byte[] message = "nfnn.cz".getBytes(StandardCharsets.US_ASCII);

        assertThat(signer.sign(message)).isEqualTo(Rfc8032Keys.test1().sign(message));
    }

    @Test
    @DisplayName("Given the RFC 8032 vectors, when the signatures are checked, then each verifies under its own public key only")
    void should_verify_only_under_own_key_when_checked_given_rfc_vectors() {
        Ed25519ReceiptSigner signer = Rfc8032Keys.test1();
        byte[] message = HEX.parseHex(Rfc8032Keys.TEST_2_MESSAGE);
        byte[] signature = HEX.parseHex(Rfc8032Keys.TEST_2_SIGNATURE);

        assertThat(signer.verifies(HEX.parseHex(Rfc8032Keys.TEST_2_PUBLIC_KEY), message, signature)).isTrue();
        assertThat(signer.verifies(HEX.parseHex(Rfc8032Keys.TEST_1_PUBLIC_KEY), message, signature)).isFalse();
        assertThat(signer.verifies(HEX.parseHex(Rfc8032Keys.TEST_2_PUBLIC_KEY), new byte[0], signature)).isFalse();
    }

    @Test
    @DisplayName("Given a public key or a signature of the wrong length, when a signature is checked, then it does not verify")
    void should_not_verify_when_checked_given_wrong_lengths() {
        Ed25519ReceiptSigner signer = Rfc8032Keys.test1();

        assertThat(signer.verifies(new byte[31], new byte[0], HEX.parseHex(Rfc8032Keys.TEST_1_SIGNATURE))).isFalse();
        assertThat(signer.verifies(HEX.parseHex(Rfc8032Keys.TEST_1_PUBLIC_KEY), new byte[0], new byte[63])).isFalse();
    }

    @Test
    @DisplayName("Given a seed that is not 32 bytes, when a signer is made, then it is refused")
    void should_refuse_when_made_given_seed_of_wrong_length() {
        assertThatIllegalArgumentException().isThrownBy(() -> Ed25519ReceiptSigner.fromSeed(new byte[31]));
    }
}
