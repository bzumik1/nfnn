package cz.novanadeje.app.donations.domain.signing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptSigningKeyTest {

    private static final String PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
    private static final String OTHER_PUBLIC_KEY = "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
    private static final Instant REGISTERED_AT = Instant.parse("2026-11-13T11:00:00.700Z");

    @Test
    @DisplayName("Given a key registered now, when its sealed content is read, then it names the id, the public key, the registration second and the status, one per line")
    void should_name_every_field_when_sealed_content_is_read_given_a_registered_key() {
        ReceiptSigningKey key = ReceiptSigningKey.register(HexFormat.of().parseHex(PUBLIC_KEY), REGISTERED_AT, content -> "seal");

        assertThat(new String(key.sealedContent(), StandardCharsets.UTF_8))
                .isEqualTo("21fe31df\n" + PUBLIC_KEY + "\n2026-11-13T11:00:00Z\nactive");
    }

    @Test
    @DisplayName("Given a key, when its public key, registration time or status is replaced under the same id, then its sealed content changes")
    void should_change_sealed_content_when_a_field_is_replaced_given_the_same_id() {
        ReceiptSigningKey key = ReceiptSigningKey.register(HexFormat.of().parseHex(PUBLIC_KEY), REGISTERED_AT, content -> "seal");

        ReceiptSigningKey otherPublicKey = new ReceiptSigningKey(key.id(), HexFormat.of().parseHex(OTHER_PUBLIC_KEY), key.registeredAt(), key.status(), key.seal());
        ReceiptSigningKey otherTime = new ReceiptSigningKey(key.id(), key.publicKey(), key.registeredAt().plusSeconds(1), key.status(), key.seal());
        ReceiptSigningKey otherStatus = new ReceiptSigningKey(key.id(), key.publicKey(), key.registeredAt(), ReceiptSigningKeyStatus.REVOKED, key.seal());

        assertThat(otherPublicKey.sealedContent()).isNotEqualTo(key.sealedContent());
        assertThat(otherTime.sealedContent()).isNotEqualTo(key.sealedContent());
        assertThat(otherStatus.sealedContent()).isNotEqualTo(key.sealedContent());
    }

    @Test
    @DisplayName("Given a registered key, when its id is checked against its public key, then it matches")
    void should_match_when_id_is_checked_given_a_registered_key() {
        assertThat(ReceiptSigningKey.register(HexFormat.of().parseHex(PUBLIC_KEY), REGISTERED_AT, content -> "seal").idMatchesPublicKey()).isTrue();
    }

    @Test
    @DisplayName("Given a row that pairs a key id with another public key, when its id is checked, then it does not match")
    void should_not_match_when_id_is_checked_given_another_public_key_under_the_id() {
        ReceiptSigningKey key = ReceiptSigningKey.register(HexFormat.of().parseHex(PUBLIC_KEY), REGISTERED_AT, content -> "seal");

        assertThat(new ReceiptSigningKey(key.id(), HexFormat.of().parseHex(OTHER_PUBLIC_KEY), key.registeredAt(), key.status(), key.seal())
                .idMatchesPublicKey()).isFalse();
        assertThat(new ReceiptSigningKey(key.id(), new byte[31], key.registeredAt(), key.status(), key.seal()).idMatchesPublicKey()).isFalse();
    }

    @Test
    @DisplayName("Given an active key, when it is withdrawn, then it keeps its id, public key and registration time, turns revoked and is sealed again over the revoked content")
    void should_turn_revoked_and_seal_again_when_withdrawn_given_an_active_key() {
        ReceiptSigningKey key = ReceiptSigningKey.register(HexFormat.of().parseHex(PUBLIC_KEY), REGISTERED_AT, content -> "seal");

        List<String> sealedContents = new ArrayList<>();
        ReceiptSigningKey withdrawn = key.withdrawn(content -> {
            sealedContents.add(new String(content, StandardCharsets.UTF_8));
            return "sealed-revoked";
        });

        assertThat(withdrawn.id()).isEqualTo(key.id());
        assertThat(withdrawn.publicKey()).isEqualTo(key.publicKey());
        assertThat(withdrawn.registeredAt()).isEqualTo(key.registeredAt());
        assertThat(withdrawn.status()).isEqualTo(ReceiptSigningKeyStatus.REVOKED);
        assertThat(withdrawn.isWithdrawn()).isTrue();
        assertThat(key.isWithdrawn()).isFalse();
        assertThat(withdrawn.seal()).isEqualTo("sealed-revoked");
        assertThat(sealedContents).containsExactly("21fe31df\n" + PUBLIC_KEY + "\n2026-11-13T11:00:00Z\nrevoked");
    }

    @Test
    @DisplayName("Given a key already withdrawn, when it is withdrawn again, then it refuses as already withdrawn")
    void should_refuse_when_withdrawn_given_a_key_already_withdrawn() {
        ReceiptSigningKey withdrawn = ReceiptSigningKey.register(HexFormat.of().parseHex(PUBLIC_KEY), REGISTERED_AT, content -> "seal")
                .withdrawn(content -> "seal");

        assertThatThrownBy(() -> withdrawn.withdrawn(content -> "again")).isInstanceOf(ReceiptSigningKeyAlreadyWithdrawn.class)
                .hasFieldOrPropertyWithValue("code", "donations/receipt-signing-key-already-withdrawn");
    }
}
