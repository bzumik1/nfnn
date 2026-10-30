package cz.novanadeje.app.donations.infrastructure.report;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class MonthlyReportFormattingCasesTest {

    @Test
    @DisplayName("Given a bank time in summer, when v2 formats it for the e-mail, then it is Prague time")
    void should_be_prague_time_when_v2_formats_a_bank_time_in_summer() {
        assertThat(MonthlyReportFormats.time(Instant.parse("2026-07-31T22:30:00Z"))).isEqualTo("1. 8. 2026 0:30");
    }
}
