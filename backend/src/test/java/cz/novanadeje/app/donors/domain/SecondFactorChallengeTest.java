package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class SecondFactorChallengeTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(5);
    private static final int MAX_ATTEMPTS = 5;

    @Test
    @DisplayName("Given a challenge just issued, when it is checked within its lifetime, then it is usable and stores only the secret's hash")
    void should_be_usable_when_fresh() {
        LinkSecret secret = LinkSecret.generate();

        SecondFactorChallenge challenge = SecondFactorChallenge.issue(secret, DonorId.newId(NOW), NOW, TTL);

        assertThat(challenge.isUsableAt(NOW.plus(Duration.ofMinutes(4)), MAX_ATTEMPTS)).isTrue();
        assertThat(challenge.secretHash()).isEqualTo(secret.hash()).doesNotContain(secret.value());
        assertThat(challenge.expiresAt()).isEqualTo(NOW.plus(TTL));
        assertThat(challenge.failedAttempts()).isZero();
        assertThat(challenge.usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given a challenge, when its lifetime passed, it was used, or it failed the allowed number of times, then it is not usable")
    void should_not_be_usable_when_expired_used_or_exhausted() {
        DonorId donor = DonorId.newId(NOW);
        SecondFactorChallenge expired = SecondFactorChallenge.issue(LinkSecret.generate(), donor, NOW, TTL);
        SecondFactorChallenge used = SecondFactorChallenge.issue(LinkSecret.generate(), donor, NOW, TTL);
        SecondFactorChallenge exhausted = SecondFactorChallenge.issue(LinkSecret.generate(), donor, NOW, TTL);

        used.markUsed(NOW.plusSeconds(10));
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            assertThat(exhausted.isUsableAt(NOW, MAX_ATTEMPTS)).isTrue();
            exhausted.recordFailedAttempt();
        }

        assertThat(expired.isUsableAt(NOW.plus(TTL), MAX_ATTEMPTS)).isFalse();
        assertThat(used.isUsableAt(NOW.plusSeconds(20), MAX_ATTEMPTS)).isFalse();
        assertThat(used.usedAt()).contains(NOW.plusSeconds(10));
        assertThat(exhausted.isUsableAt(NOW, MAX_ATTEMPTS)).isFalse();
        assertThat(exhausted.failedAttempts()).isEqualTo(MAX_ATTEMPTS);
    }
}
