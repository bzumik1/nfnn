package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ContentDigestTest {

    @Test
    @DisplayName("Given some bytes, when they are digested, then the digest is their SHA-256 in lowercase hex")
    void should_be_lowercase_sha256_when_digested_given_bytes() {
        assertThat(ContentDigest.of("abc".getBytes(StandardCharsets.UTF_8)).value())
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    @Test
    @DisplayName("Given a value that is not 64 lowercase hex characters, when a digest is made of it, then it is refused")
    void should_refuse_when_made_given_malformed_value() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ContentDigest(null));
        assertThatIllegalArgumentException().isThrownBy(() -> new ContentDigest("A".repeat(64)));
        assertThatIllegalArgumentException().isThrownBy(() -> new ContentDigest("a".repeat(63)));
        assertThatIllegalArgumentException().isThrownBy(() -> ContentDigest.of(null));
    }

    @Test
    @DisplayName("Given a snapshot without data, template, logo or a valid profile, when it is made, then it is refused")
    void should_refuse_when_made_given_incomplete_snapshot() {
        ContentDigest digest = new ContentDigest("a".repeat(64));

        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptSnapshot(null, "{}", digest, Optional.empty(), 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptSnapshot(digest, " ", digest, Optional.empty(), 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptSnapshot(digest, "{}", null, Optional.empty(), 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptSnapshot(digest, "{}", digest, null, 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptSnapshot(digest, "{}", digest, Optional.empty(), 0));
    }
}
