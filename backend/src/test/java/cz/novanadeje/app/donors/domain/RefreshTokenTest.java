package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Test
    void should_be_usable_when_checked_given_not_expired_and_not_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(13)))).isTrue();
    }

    @Test
    void should_not_be_usable_when_checked_given_expired() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(14)))).isFalse();
    }

    @Test
    void should_not_be_usable_when_checked_given_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        token.revoke(NOW.plusSeconds(10));

        assertThat(token.isRevoked()).isTrue();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    void should_store_only_hash_when_issued_given_secret() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.secretHash()).isEqualTo(secret.hash());
        assertThat(token.secretHash()).isNotEqualTo(secret.value());
        assertThat(RefreshTokenSecret.fromValue(secret.value()).hash()).isEqualTo(secret.hash());
    }
}
