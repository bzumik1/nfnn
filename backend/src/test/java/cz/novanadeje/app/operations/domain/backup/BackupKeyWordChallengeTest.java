package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class BackupKeyWordChallengeTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");
    private static final BackupKeyWordPositions POSITIONS = new BackupKeyWordPositions(List.of(3, 11, 20));

    @Test
    @DisplayName("Given drawn positions, when a challenge is issued, then it asks them, is valid for 30 minutes and allows five attempts")
    void should_last_30_minutes_with_five_attempts_when_issued_given_positions() {
        BackupKeyWordChallenge challenge = BackupKeyWordChallenge.issue(POSITIONS, NOW);

        assertThat(challenge.positions()).isEqualTo(POSITIONS);
        assertThat(challenge.validUntil()).isEqualTo(NOW.plus(Duration.ofMinutes(30)));
        assertThat(challenge.attemptsLeft()).isEqualTo(5);
    }

    @Test
    @DisplayName("Given a challenge issued 30 minutes ago, when its expiry is checked, then it is still valid, and a second later it is expired")
    void should_expire_only_after_30_minutes_when_checked_given_an_issued_challenge() {
        BackupKeyWordChallenge challenge = BackupKeyWordChallenge.issue(POSITIONS, NOW);

        assertThat(challenge.expiredAt(NOW.plus(Duration.ofMinutes(30)))).isFalse();
        assertThat(challenge.expiredAt(NOW.plus(Duration.ofMinutes(30)).plusSeconds(1))).isTrue();
    }

    @Test
    @DisplayName("Given a fresh challenge, when an answer is refused, then the same positions stay asked with one attempt fewer")
    void should_keep_the_positions_with_one_attempt_fewer_when_refused_given_a_fresh_challenge() {
        BackupKeyWordChallenge challenge = BackupKeyWordChallenge.issue(POSITIONS, NOW);

        assertThat(challenge.afterRefusal()).contains(new BackupKeyWordChallenge(POSITIONS, challenge.validUntil(), 4));
    }

    @Test
    @DisplayName("Given a challenge, when five answers are refused, then the fifth refusal ends it")
    void should_end_when_the_fifth_answer_is_refused_given_a_challenge() {
        Optional<BackupKeyWordChallenge> challenge = Optional.of(BackupKeyWordChallenge.issue(POSITIONS, NOW));
        for (int refusal = 1; refusal <= 4; refusal++) {
            challenge = challenge.flatMap(BackupKeyWordChallenge::afterRefusal);
            assertThat(challenge).isPresent();
        }

        assertThat(challenge.flatMap(BackupKeyWordChallenge::afterRefusal)).isEmpty();
    }
}
