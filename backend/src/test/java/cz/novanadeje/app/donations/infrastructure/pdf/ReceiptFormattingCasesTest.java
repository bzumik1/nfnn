package cz.novanadeje.app.donations.infrastructure.pdf;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptFormattingCasesTest {

    @Test
    @DisplayName("Given a receipt date, when v2 formats it in Czech, then the day and month have no leading zero, unlike the web's dates")
    void should_print_day_and_month_without_a_leading_zero_when_v2_formats_a_receipt_date_in_czech() {
        assertThat(ReceiptFormats.czechDate(LocalDate.of(2026, 3, 5))).isEqualTo("5. 3. 2026");
    }
}
