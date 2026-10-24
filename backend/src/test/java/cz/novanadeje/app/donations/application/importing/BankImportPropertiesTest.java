package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;
import java.time.LocalDate;
import java.time.Period;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class BankImportPropertiesTest {

    private static final Duration COOLDOWN = Duration.ofSeconds(30);

    @Test
    @DisplayName("Given an empty history start, when the properties are converted, then they have no history start")
    void should_have_no_history_start_when_converted_given_empty_history_from() {
        assertThat(new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", COOLDOWN).toSettings())
                .isEqualTo(ImportSettings.defaults());
        assertThat(new BankImportProperties(Period.ofDays(3), Period.ofDays(89), null, COOLDOWN).toSettings().historyFrom()).isEmpty();
    }

    @Test
    @DisplayName("Given an ISO date, when the properties are converted, then they parse the history start")
    void should_parse_history_start_when_converted_given_iso_date() {
        assertThat(new BankImportProperties(Period.ofDays(2), Period.ofDays(80), " 2025-01-01 ", COOLDOWN).toSettings())
                .isEqualTo(new ImportSettings(Period.ofDays(2), Period.ofDays(80), Optional.of(LocalDate.of(2025, 1, 1))));
    }

    @ParameterizedTest
    @ValueSource(strings = {"2025-01-01 00:00:00 +0000 UTC", "2025-01-01T00:00:00Z", "2025-01-01T00:00:00"})
    @DisplayName("Given a history start that ZimaOS rewrote as UTC midnight, when the properties are converted, then they take the date")
    void should_take_the_date_when_converted_given_history_from_rewritten_as_utc_midnight_by_zimaos(String historyFrom) {
        assertThat(new BankImportProperties(Period.ofDays(3), Period.ofDays(89), historyFrom, COOLDOWN).toSettings().historyFrom())
                .contains(LocalDate.of(2025, 1, 1));
    }

    @ParameterizedTest
    @ValueSource(strings = {"1.1.2025", "2025-13-01", "2025-01-01 12:00:00 +0000 UTC", "2025-01-01 00:00:00 +0100 CET", "2025-01-01x"})
    @DisplayName("Given a history start that is not a date, when the properties are bound, then binding fails")
    void should_refuse_to_bind_when_created_given_history_from_that_is_not_a_date(String historyFrom) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new BankImportProperties(Period.ofDays(3), Period.ofDays(89), historyFrom, COOLDOWN))
                .withMessage("FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD, e.g. 2025-01-01, but is '" + historyFrom + "'");
    }

    @Test
    @DisplayName("Given a positive duration, when the properties are created, then they keep the on-demand cooldown")
    void should_keep_the_on_demand_cooldown_when_created_given_positive_duration() {
        assertThat(new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", COOLDOWN).onDemandCooldown()).isEqualTo(COOLDOWN);
    }

    @Test
    @DisplayName("Given a missing or negative on-demand cooldown, when the properties are bound, then binding fails")
    void should_refuse_to_bind_when_created_given_missing_or_negative_on_demand_cooldown() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", null))
                .withMessage("app.donations.import.on-demand-cooldown must be zero or positive, but is null");
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "", Duration.ofSeconds(-1)))
                .withMessage("app.donations.import.on-demand-cooldown must be zero or positive, but is PT-1S");
    }
}
