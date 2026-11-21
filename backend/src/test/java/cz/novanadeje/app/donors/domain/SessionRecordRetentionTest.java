package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class SessionRecordRetentionTest {

    private static final Instant NOW = Instant.parse("2026-11-15T03:30:00Z");

    @Test
    @DisplayName("Given a moment, when the clean-up asks which spent refresh tokens go, then those spent before thirty days earlier do")
    void should_keep_spent_tokens_thirty_days_when_asked_given_a_moment() {
        assertThat(SessionRecordRetention.spentTokensCutoff(NOW)).isEqualTo(Instant.parse("2026-10-16T03:30:00Z"));
    }

    @Test
    @DisplayName("Given a moment, when the clean-up asks which spent one-time secrets go, then those expired before thirty days earlier do")
    void should_keep_spent_secrets_thirty_days_when_asked_given_a_moment() {
        assertThat(SessionRecordRetention.spentSecretsCutoff(NOW)).isEqualTo(Instant.parse("2026-10-16T03:30:00Z"));
    }

    @Test
    @DisplayName("Given a moment, when the clean-up asks which ended devices go, then those ended before 400 days earlier do")
    void should_keep_ended_devices_400_days_when_asked_given_a_moment() {
        assertThat(SessionRecordRetention.endedDevicesCutoff(NOW)).isEqualTo(Instant.parse("2025-10-11T03:30:00Z"));
    }
}
