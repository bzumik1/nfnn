package cz.novanadeje.app.donations.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptKeysResponseTest {

    @Test
    @DisplayName("Given the published keys, when their entity tag is taken, then it is the first twelve bytes of the SHA-256 of the list in base64url")
    void should_be_truncated_sha256_in_base64url_when_tagged_given_published_keys() {
        ReceiptKeysResponse response = new ReceiptKeysResponse(new ReceiptKeysResponse.Foundation("Nadační fond Nová naděje", "12345678"),
                List.of(new ReceiptKeysResponse.Key("21fe31df", ReceiptKeysResponse.ALGORITHM, "cHVibGlj", "active",
                        Instant.parse("2026-01-01T00:00:00Z"))));

        assertThat(response.entityTag()).isEqualTo("\"OJxiMf3QEFQg0IXJ\"");
    }
}
