package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class PasswordResetTokenTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Duration LIFETIME = Duration.ofHours(1);
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Test
    @DisplayName("Given a secret, when a token is issued, then it stores only the hash, expires after the lifetime and is unused")
    void should_store_hash_and_expiry_when_issued_given_secret() {
        PasswordResetSecret secret = PasswordResetSecret.generate();

        PasswordResetToken token = PasswordResetToken.issue(secret, DONOR, NOW, LIFETIME);

        assertThat(token.id()).isNotNull();
        assertThat(token.donorId()).isEqualTo(DONOR);
        assertThat(token.secretHash()).isEqualTo(secret.hash()).isNotEqualTo(secret.value());
        assertThat(token.issuedAt()).isEqualTo(NOW);
        assertThat(token.expiresAt()).isEqualTo(NOW.plus(LIFETIME));
        assertThat(token.usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given an unused token, when checked before it expires, then it is usable")
    void should_be_usable_when_checked_given_unused_and_not_expired() {
        PasswordResetToken token = PasswordResetToken.issue(PasswordResetSecret.generate(), DONOR, NOW, LIFETIME);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofMinutes(59)))).isTrue();
    }

    @Test
    @DisplayName("Given an unused token, when checked at or after its expiry, then it is not usable")
    void should_not_be_usable_when_checked_given_expired() {
        PasswordResetToken token = PasswordResetToken.issue(PasswordResetSecret.generate(), DONOR, NOW, LIFETIME);

        assertThat(token.isUsableAt(NOW.plus(LIFETIME))).isFalse();
        assertThat(token.isUsableAt(NOW.plus(Duration.ofMinutes(61)))).isFalse();
    }

    @Test
    @DisplayName("Given a used token, when checked before its expiry, then it is not usable and remembers when it was used")
    void should_not_be_usable_when_checked_given_used() {
        PasswordResetToken token = PasswordResetToken.issue(PasswordResetSecret.generate(), DONOR, NOW, LIFETIME);

        token.markUsed(NOW.plusSeconds(60));

        assertThat(token.usedAt()).contains(NOW.plusSeconds(60));
        assertThat(token.isUsableAt(NOW.plusSeconds(120))).isFalse();
    }

    @Test
    @DisplayName("Given a used token, when it is marked used again, then it refuses")
    void should_refuse_when_marked_used_twice_given_used_token() {
        PasswordResetToken token = PasswordResetToken.issue(PasswordResetSecret.generate(), DONOR, NOW, LIFETIME);
        token.markUsed(NOW.plusSeconds(60));

        assertThatIllegalStateException().isThrownBy(() -> token.markUsed(NOW.plusSeconds(120)));
        assertThat(token.usedAt()).contains(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("Given stored values, when a token is reconstituted, then it keeps them")
    void should_keep_values_when_reconstituted_given_stored_row() {
        PasswordResetToken stored = PasswordResetToken.issue(PasswordResetSecret.generate(), DONOR, NOW, LIFETIME);

        PasswordResetToken token = PasswordResetToken.reconstitute(stored.id(), DONOR, stored.secretHash(), NOW, NOW.plus(LIFETIME), NOW.plusSeconds(5));

        assertThat(token.id()).isEqualTo(stored.id());
        assertThat(token.secretHash()).isEqualTo(stored.secretHash());
        assertThat(token.usedAt()).contains(NOW.plusSeconds(5));
        assertThat(token.isUsableAt(NOW.plusSeconds(10))).isFalse();
    }
}
