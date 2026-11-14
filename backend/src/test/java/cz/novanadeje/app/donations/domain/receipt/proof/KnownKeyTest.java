package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofReader.KnownKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class KnownKeyTest {

    private static final byte[] PUBLIC_KEY = filled(ReceiptSigningKeyId.PUBLIC_KEY_BYTES, 7);
    private static final ReceiptSigningKeyId ID = ReceiptSigningKeyId.of(PUBLIC_KEY);

    @Test
    @DisplayName("Given a public key, when a known key is made, then it keeps a copy and hands out copies")
    void should_keep_copy_when_created_given_public_key() {
        byte[] bytes = PUBLIC_KEY.clone();

        KnownKey key = new KnownKey(ID, bytes, false);
        bytes[0] = 0;
        key.publicKey()[1] = 0;

        assertThat(key.publicKey()).isEqualTo(PUBLIC_KEY);
    }

    @Test
    @DisplayName("Given two known keys of the same id, key and revocation, when compared, then they are equal, and a revoked one differs")
    void should_be_equal_when_compared_given_same_id_key_and_revocation() {
        assertThat(new KnownKey(ID, PUBLIC_KEY, false)).isEqualTo(new KnownKey(ID, PUBLIC_KEY.clone(), false))
                .hasSameHashCodeAs(new KnownKey(ID, PUBLIC_KEY.clone(), false));
        assertThat(new KnownKey(ID, PUBLIC_KEY, false)).isNotEqualTo(new KnownKey(ID, PUBLIC_KEY, true));
    }

    @Test
    @DisplayName("Given a known key, when printed, then its id and revocation show and its key bytes do not")
    void should_print_id_and_revocation_when_printed_given_known_key() {
        assertThat(new KnownKey(ID, PUBLIC_KEY, true)).hasToString("KnownKey[" + ID + ", revoked true]");
    }

    @Test
    @DisplayName("Given no id, no key or a key that is not 32 bytes, when a known key is made, then it is refused")
    void should_refuse_when_created_given_no_id_or_key_of_another_length() {
        assertThatThrownBy(() -> new KnownKey(null, PUBLIC_KEY, false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new KnownKey(ID, null, false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new KnownKey(ID, filled(ReceiptSigningKeyId.PUBLIC_KEY_BYTES - 1, 7), false)).isInstanceOf(IllegalArgumentException.class);
    }

    private static byte[] filled(int length, int value) {
        byte[] bytes = new byte[length];
        Arrays.fill(bytes, (byte) value);
        return bytes;
    }
}
