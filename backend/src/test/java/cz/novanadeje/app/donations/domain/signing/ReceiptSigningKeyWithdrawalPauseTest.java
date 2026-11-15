package cz.novanadeje.app.donations.domain.signing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptSigningKeyWithdrawalPauseTest {

    private static final Instant NOW = Instant.parse("2026-11-15T10:00:00Z");

    @Test
    @DisplayName("Given a moment, when the pause asks since when refusals count, then it is 15 minutes earlier")
    void should_count_the_last_15_minutes_when_asked_given_a_moment() {
        assertThat(ReceiptSigningKeyWithdrawalPause.refusalsCountedSince(NOW)).isEqualTo(Instant.parse("2026-11-15T09:45:00Z"));
    }

    @Test
    @DisplayName("Given four refusals in the window, when the pause is checked, then withdrawals are not paused")
    void should_not_pause_when_checked_given_four_refusals() {
        assertThat(ReceiptSigningKeyWithdrawalPause.pausedAfter(4)).isFalse();
    }

    @Test
    @DisplayName("Given five refusals in the window, when the pause is checked, then withdrawals are paused")
    void should_pause_when_checked_given_five_refusals() {
        assertThat(ReceiptSigningKeyWithdrawalPause.pausedAfter(5)).isTrue();
        assertThat(ReceiptSigningKeyWithdrawalPause.REFUSALS).isEqualTo(5);
    }
}
