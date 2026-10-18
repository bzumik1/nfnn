package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PasswordResetSecretTest {

    private static final String WELL_FORMED = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Q";

    @Test
    @DisplayName("Given nothing, when a secret is generated, then it has 43 characters from the base64url alphabet")
    void should_have_43_base64url_characters_when_generated() {
        assertThat(PasswordResetSecret.generate().value()).matches("[A-Za-z0-9_-]{43}");
    }

    @Test
    @DisplayName("Given two generated secrets, when compared, then they differ")
    void should_differ_when_generated_twice() {
        assertThat(PasswordResetSecret.generate().value()).isNotEqualTo(PasswordResetSecret.generate().value());
    }

    @Test
    @DisplayName("Given a secret, when hashed, then the hash is 64 lowercase hex characters and equal for equal values")
    void should_hash_to_64_hex_characters_when_hashed_given_secret() {
        PasswordResetSecret secret = new PasswordResetSecret(WELL_FORMED);

        assertThat(secret.hash()).matches("[0-9a-f]{64}");
        assertThat(new PasswordResetSecret(WELL_FORMED).hash()).isEqualTo(secret.hash());
        assertThat(PasswordResetSecret.generate().hash()).isNotEqualTo(secret.hash());
    }

    @Test
    @DisplayName("Given a secret, when hashed, then the hash is the SHA-256 of its ASCII value")
    void should_be_sha256_of_value_when_hashed_given_secret() throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(WELL_FORMED.getBytes(StandardCharsets.US_ASCII));

        assertThat(new PasswordResetSecret(WELL_FORMED).hash()).isEqualTo(HexFormat.of().formatHex(digest));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "short", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_QQ", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-.Q",
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-+Q", " bcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Q"})
    @DisplayName("Given a value that is not 43 base64url characters, when a secret is made from it, then it is refused")
    void should_refuse_when_created_given_malformed_value(String value) {
        assertThatIllegalArgumentException().isThrownBy(() -> new PasswordResetSecret(value));
    }

    @Test
    @DisplayName("Given a secret, when printed, then the value is masked")
    void should_mask_value_when_printed_given_secret() {
        PasswordResetSecret secret = new PasswordResetSecret(WELL_FORMED);

        assertThat(secret.toString()).isEqualTo("PasswordResetSecret[***]").doesNotContain(WELL_FORMED);
    }
}
