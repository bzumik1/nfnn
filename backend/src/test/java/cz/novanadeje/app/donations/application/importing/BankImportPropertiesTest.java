package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Period;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class BankImportPropertiesTest {

    @Test
    void should_have_no_history_start_when_converted_given_empty_history_from() {
        assertThat(new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "").toSettings())
                .isEqualTo(ImportSettings.defaults());
        assertThat(new BankImportProperties(Period.ofDays(3), Period.ofDays(89), null).toSettings().historyFrom()).isEmpty();
    }

    @Test
    void should_parse_history_start_when_converted_given_iso_date() {
        assertThat(new BankImportProperties(Period.ofDays(2), Period.ofDays(80), " 2025-01-01 ").toSettings())
                .isEqualTo(new ImportSettings(Period.ofDays(2), Period.ofDays(80), Optional.of(LocalDate.of(2025, 1, 1))));
    }

    @Test
    void should_refuse_to_bind_when_created_given_history_from_that_is_not_an_iso_date() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new BankImportProperties(Period.ofDays(3), Period.ofDays(89), "1.1.2025"))
                .withMessage("FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD, e.g. 2025-01-01, but is '1.1.2025'");
    }
}
