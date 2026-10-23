package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReportSettingsTest {

    private static final EmailAddress INFO = new EmailAddress("info@nfnn.cz");
    private static final EmailAddress PAVEL = new EmailAddress("pavel@example.cz");

    @Test
    @DisplayName("Given only the configured recipient, when the defaults are made, then the report goes there on the 1st at 7:00 with every section")
    void should_send_everything_on_the_first_when_defaults_made_given_configured_recipient() {
        ReportSettings settings = ReportSettings.defaults(INFO);

        assertThat(settings.recipients().values()).containsExactly("info@nfnn.cz");
        assertThat(settings.sendDay()).isEqualTo(1);
        assertThat(settings.sendHour()).isEqualTo(7);
        assertThat(settings.sections()).isEqualTo(ReportSections.all());
        assertThat(settings.sections().names()).containsExactly("donors", "donations", "unpaired payments", "bank import");
    }

    @ParameterizedTest(name = "day {0}")
    @ValueSource(ints = {0, 29, 31})
    @DisplayName("Given a send day outside 1–28, when the settings are made, then they are refused so every month has the day")
    void should_refuse_when_made_given_send_day_outside_every_month(int sendDay) {
        assertThatThrownBy(() -> new ReportSettings(ReportRecipients.of(INFO), sendDay, 7, ReportSections.all()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("between 1 and 28");
    }

    @ParameterizedTest(name = "hour {0}")
    @ValueSource(ints = {-1, 24})
    @DisplayName("Given a send hour outside 0–23, when the settings are made, then they are refused")
    void should_refuse_when_made_given_send_hour_outside_day(int sendHour) {
        assertThatThrownBy(() -> new ReportSettings(ReportRecipients.of(INFO), 1, sendHour, ReportSections.all()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("between 0 and 23");
    }

    @Test
    @DisplayName("Given the report sent on the 5th at 9:00, when it is earlier, then it is not due, and from 9:00 on the 5th it is")
    void should_be_due_from_send_day_and_hour_when_asked_given_fifth_at_nine() {
        ReportSettings settings = new ReportSettings(ReportRecipients.of(INFO), 5, 9, ReportSections.all());

        assertThat(settings.dueAt(LocalDateTime.of(2026, 10, 4, 23, 59))).isFalse();
        assertThat(settings.dueAt(LocalDateTime.of(2026, 10, 5, 8, 59))).isFalse();
        assertThat(settings.dueAt(LocalDateTime.of(2026, 10, 5, 9, 0))).isTrue();
        assertThat(settings.dueAt(LocalDateTime.of(2026, 10, 6, 0, 0))).isTrue();
        assertThat(settings.dueAt(LocalDateTime.of(2026, 10, 31, 3, 0))).isTrue();
        assertThat(settings.sendDateFor(ReportMonth.of(2026, 9))).isEqualTo(LocalDate.of(2026, 10, 5));
    }

    @Test
    @DisplayName("Given the report sent on the 1st at midnight, when the 1st begins, then it is due at once")
    void should_be_due_at_midnight_when_asked_given_first_at_zero() {
        ReportSettings settings = new ReportSettings(ReportRecipients.of(INFO), 1, 0, ReportSections.all());

        assertThat(settings.dueAt(LocalDateTime.of(2026, 11, 1, 0, 0))).isTrue();
    }

    @Test
    @DisplayName("Given no recipient, a duplicate or more than ten, when the recipients are made, then they are refused")
    void should_refuse_when_recipients_made_given_none_duplicate_or_too_many() {
        assertThatThrownBy(() -> new ReportRecipients(List.of())).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("at least one");
        assertThatThrownBy(() -> ReportRecipients.parse(List.of("info@nfnn.cz", "INFO@nfnn.cz")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("once");
        assertThatThrownBy(() -> new ReportRecipients(IntStream.rangeClosed(1, 11)
                .mapToObj(number -> new EmailAddress("donor" + number + "@example.cz")).toList()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("at most 10");
        assertThatThrownBy(() -> ReportRecipients.parse(List.of("pavel"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given two addresses with spaces and capitals, when the recipients are parsed, then they are normalised and counted")
    void should_normalise_when_parsed_given_spaced_capitalised_addresses() {
        ReportRecipients recipients = ReportRecipients.parse(List.of(" Info@nfnn.cz ", "pavel@example.cz"));

        assertThat(recipients.values()).containsExactly("info@nfnn.cz", "pavel@example.cz");
        assertThat(recipients.count()).isEqualTo(2);
        assertThat(recipients).isEqualTo(ReportRecipients.of(INFO, PAVEL));
    }

    @Test
    @DisplayName("Given every section switched off, when the sections are made, then they are refused")
    void should_refuse_when_sections_made_given_none() {
        assertThatThrownBy(() -> new ReportSections(false, false, false, false))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("at least one section");
        assertThat(new ReportSections(false, true, false, true).names()).containsExactly("donations", "bank import");
    }
}
