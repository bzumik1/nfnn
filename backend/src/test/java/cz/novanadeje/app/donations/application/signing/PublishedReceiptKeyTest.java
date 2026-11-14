package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class PublishedReceiptKeyTest {

    private static final byte[] PUBLIC_KEY = filled(7);
    private static final ReceiptSigningKeyId ID = ReceiptSigningKeyId.of(PUBLIC_KEY);
    private static final Instant REGISTERED_AT = Instant.parse("2026-11-01T10:00:00Z");

    @Test
    @DisplayName("Given a public key, when a published receipt key is made, then it keeps a copy and hands out copies")
    void should_keep_copy_when_created_given_public_key() {
        byte[] bytes = PUBLIC_KEY.clone();

        PublishedReceiptKey key = published(bytes, ReceiptSigningKeyStatus.ACTIVE);
        bytes[0] = 0;
        key.publicKey()[1] = 0;

        assertThat(key.publicKey()).isEqualTo(PUBLIC_KEY);
    }

    @Test
    @DisplayName("Given two published receipt keys of the same key and state, when compared, then they are equal, and another status makes them differ")
    void should_be_equal_when_compared_given_same_key_and_state() {
        assertThat(published(PUBLIC_KEY, ReceiptSigningKeyStatus.ACTIVE)).isEqualTo(published(PUBLIC_KEY.clone(), ReceiptSigningKeyStatus.ACTIVE))
                .hasSameHashCodeAs(published(PUBLIC_KEY.clone(), ReceiptSigningKeyStatus.ACTIVE));
        assertThat(published(PUBLIC_KEY, ReceiptSigningKeyStatus.ACTIVE)).isNotEqualTo(published(PUBLIC_KEY, ReceiptSigningKeyStatus.REVOKED));
    }

    @Test
    @DisplayName("Given a published receipt key, when printed, then its id and state show and its key bytes do not")
    void should_print_id_and_state_when_printed_given_published_receipt_key() {
        assertThat(published(PUBLIC_KEY, ReceiptSigningKeyStatus.ACTIVE))
                .hasToString("PublishedReceiptKey[" + ID + ", ACTIVE, registered " + REGISTERED_AT + ", published true, current true]");
    }

    private static PublishedReceiptKey published(byte[] publicKey, ReceiptSigningKeyStatus status) {
        return new PublishedReceiptKey(ID, publicKey, REGISTERED_AT, status, true, true);
    }

    private static byte[] filled(int value) {
        byte[] bytes = new byte[ReceiptSigningKeyId.PUBLIC_KEY_BYTES];
        Arrays.fill(bytes, (byte) value);
        return bytes;
    }
}
