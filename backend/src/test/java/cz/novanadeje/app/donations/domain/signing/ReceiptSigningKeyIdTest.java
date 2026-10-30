package cz.novanadeje.app.donations.domain.signing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptSigningKeyIdTest {

    @ParameterizedTest
    @CsvSource({
            "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a, 21fe31df",
            "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c, 39f713d0",
            "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025, dac073e0",
            "278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e, 91384c41",
            "ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf, 5f9b247e"
    })
    @DisplayName("Given the public key of each test of RFC 8032, when its id is taken, then it is the listed id and a public test key")
    void should_be_a_public_test_key_when_its_id_is_taken_given_an_rfc_8032_public_key(String publicKeyHex, String keyId) {
        ReceiptSigningKeyId id = ReceiptSigningKeyId.of(HexFormat.of().parseHex(publicKeyHex));

        assertThat(id.value()).isEqualTo(keyId);
        assertThat(id.isPublicTestKey()).isTrue();
    }

    @Test
    @DisplayName("Given the id of a key the RFC does not publish, when it is checked, then it is no public test key")
    void should_not_be_a_public_test_key_when_checked_given_a_key_of_its_own() {
        assertThat(new ReceiptSigningKeyId("5e00e8d0").isPublicTestKey()).isFalse();
    }
}
