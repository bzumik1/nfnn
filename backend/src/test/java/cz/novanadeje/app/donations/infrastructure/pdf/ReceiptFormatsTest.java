package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptFormatsTest {

    private static final String NBSP = " ";

    @Test
    @DisplayName("Given an amount with hellers, when written in Czech, then thousands are split by a no-break space and two decimals follow a comma")
    void should_write_two_decimals_with_comma_when_written_in_czech_given_hellers() {
        assertThat(ReceiptFormats.czechAmount(Money.czk(125050))).isEqualTo("1" + NBSP + "250,50" + NBSP + "Kč");
    }

    @Test
    @DisplayName("Given a whole amount, when written in Czech, then no decimals are written")
    void should_write_no_decimals_when_written_in_czech_given_whole_crowns() {
        assertThat(ReceiptFormats.czechAmount(Money.czk(50000))).isEqualTo("500" + NBSP + "Kč");
        assertThat(ReceiptFormats.czechAmount(Money.czk(123456700))).isEqualTo("1" + NBSP + "234" + NBSP + "567" + NBSP + "Kč");
        assertThat(ReceiptFormats.czechAmount(Money.czk(105))).isEqualTo("1,05" + NBSP + "Kč");
    }

    @Test
    @DisplayName("Given amounts, when written in English, then the currency code leads, a comma splits thousands and a point the decimals")
    void should_write_currency_code_first_when_written_in_english_given_amounts() {
        assertThat(ReceiptFormats.englishAmount(Money.czk(125050))).isEqualTo("CZK 1,250.50");
        assertThat(ReceiptFormats.englishAmount(Money.czk(50000))).isEqualTo("CZK 500");
    }

    @Test
    @DisplayName("Given amounts, when written in either language, then no narrow no-break space appears")
    void should_never_write_narrow_no_break_space_when_written_given_large_amount() {
        assertThat(ReceiptFormats.czechAmount(Money.czk(99999999))).doesNotContain(" ");
        assertThat(ReceiptFormats.englishAmount(Money.czk(99999999))).doesNotContain(" ");
    }

    @Test
    @DisplayName("Given a date, when written, then Czech has day, month and year with dots and English the month name")
    void should_write_dates_when_written_given_date() {
        assertThat(ReceiptFormats.czechDate(LocalDate.of(2026, 12, 20))).isEqualTo("20. 12. 2026");
        assertThat(ReceiptFormats.czechDate(LocalDate.of(2027, 1, 5))).isEqualTo("5. 1. 2027");
        assertThat(ReceiptFormats.englishDate(LocalDate.of(2026, 12, 20))).isEqualTo("20 December 2026");
        assertThat(ReceiptFormats.englishDate(LocalDate.of(2027, 1, 5))).isEqualTo("5 January 2027");
    }
}
