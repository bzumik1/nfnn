package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SessionLengthsTest {

    private static final Instant SIGNED_IN = Instant.parse("2026-11-05T08:00:00Z");
    private static final SessionLengths LENGTHS = new SessionLengths(14);

    @Test
    @DisplayName("Given the installed app, when a token is issued, then it lasts 400 days from that moment")
    void should_last_four_hundred_days_when_issued_given_app() {
        Instant now = SIGNED_IN.plus(Duration.ofDays(399));

        assertThat(LENGTHS.expiresAt(SessionKind.APP, SIGNED_IN, now)).isEqualTo(now.plus(Duration.ofDays(400)));
    }

    @Test
    @DisplayName("Given a remembered sign-in of 14 days, when a token is issued, then it lasts 14 days from that moment")
    void should_last_remembered_days_when_issued_given_remembered() {
        Instant now = SIGNED_IN.plus(Duration.ofDays(20));

        assertThat(LENGTHS.expiresAt(SessionKind.REMEMBERED, SIGNED_IN, now)).isEqualTo(now.plus(Duration.ofDays(14)));
        assertThat(new SessionLengths(1).expiresAt(SessionKind.REMEMBERED, SIGNED_IN, now)).isEqualTo(now.plus(Duration.ofDays(1)));
    }

    @Test
    @DisplayName("Given a browser session, when a token is issued, then it lasts 12 hours from that moment")
    void should_last_twelve_hours_idle_when_issued_given_browser() {
        Instant now = SIGNED_IN.plus(Duration.ofDays(3));

        assertThat(LENGTHS.expiresAt(SessionKind.BROWSER, SIGNED_IN, now)).isEqualTo(now.plus(Duration.ofHours(12)));
    }

    @Test
    @DisplayName("Given a public computer early in the session, when a token is issued, then it lasts one hour from that moment")
    void should_last_one_hour_idle_when_issued_given_public_early() {
        Instant now = SIGNED_IN.plus(Duration.ofHours(2));

        assertThat(LENGTHS.expiresAt(SessionKind.PUBLIC, SIGNED_IN, now)).isEqualTo(now.plus(Duration.ofHours(1)));
    }

    @Test
    @DisplayName("Given a public computer within an hour of 12 hours, when a token is issued, then it ends 12 hours after the sign-in")
    void should_end_twelve_hours_after_sign_in_when_issued_given_public_late() {
        Instant now = SIGNED_IN.plus(Duration.ofHours(11).plusMinutes(30));

        assertThat(LENGTHS.expiresAt(SessionKind.PUBLIC, SIGNED_IN, now)).isEqualTo(SIGNED_IN.plus(Duration.ofHours(12)));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 31, -1})
    @DisplayName("Given a remembered length outside 1 to 30 days, when the lengths are made, then they are refused")
    void should_refuse_when_made_given_remembered_days_out_of_range(int days) {
        assertThatIllegalArgumentException().isThrownBy(() -> new SessionLengths(days)).withMessageContaining("1 to 30 days");
    }

    @Test
    @DisplayName("Given each kind, when asked whether it outlives the browser, then only the app and a remembered sign-in do")
    void should_outlive_browser_only_when_asked_given_app_or_remembered() {
        assertThat(SessionKind.APP.outlivesTheBrowser()).isTrue();
        assertThat(SessionKind.REMEMBERED.outlivesTheBrowser()).isTrue();
        assertThat(SessionKind.BROWSER.outlivesTheBrowser()).isFalse();
        assertThat(SessionKind.PUBLIC.outlivesTheBrowser()).isFalse();
        assertThat(SessionKind.UNNAMED).isEqualTo(SessionKind.REMEMBERED);
    }
}
