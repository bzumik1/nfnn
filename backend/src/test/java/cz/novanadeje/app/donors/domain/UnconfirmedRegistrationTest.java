package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class UnconfirmedRegistrationTest {

    private static final Instant NOW = Instant.parse("2026-11-06T09:20:00Z");

    @Test
    @DisplayName("Given the lifetime of an unconfirmed registration, when it is read, then it is thirty days")
    void should_last_thirty_days_when_read_given_the_lifetime() {
        assertThat(UnconfirmedRegistration.LIFETIME).isEqualTo(Duration.ofDays(30));
    }

    @Test
    @DisplayName("Given a moment, when the expiry asks which registrations are deleted, then those registered before the moment thirty days earlier are")
    void should_expire_registrations_made_before_thirty_days_earlier_when_asked_given_a_moment() {
        assertThat(UnconfirmedRegistration.deletionCutoff(NOW)).isEqualTo(Instant.parse("2026-10-07T09:20:00Z"));
    }

    @Test
    @DisplayName("Given a reminder window shorter than the lifetime, when it is checked, then the registration outlives it, and one of the lifetime or longer it does not")
    void should_outlive_only_a_shorter_window_when_checked_given_reminder_windows() {
        assertThat(UnconfirmedRegistration.outlivesReminderWindow(Duration.ofDays(29))).isTrue();
        assertThat(UnconfirmedRegistration.outlivesReminderWindow(Duration.ofDays(30))).isFalse();
        assertThat(UnconfirmedRegistration.outlivesReminderWindow(Duration.ofDays(31))).isFalse();
    }
}
