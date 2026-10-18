package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Year;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ReceiptNumberTest {

    @Test
    @DisplayName("Given the year of issue and the first serial, when a number is made, then it is the year, a dash and six zero-padded digits")
    void should_pad_serial_to_six_digits_when_made_given_first_serial() {
        ReceiptNumber number = ReceiptNumber.of(Year.of(2027), 1);

        assertThat(number.value()).isEqualTo("2027-000001").matches("\\d{4}-\\d{6}");
        assertThat(number).hasToString("2027-000001");
    }

    @Test
    @DisplayName("Given the last serial the sequence allows, when a number is made, then it still has six digits")
    void should_accept_last_serial_when_made_given_999999() {
        assertThat(ReceiptNumber.of(Year.of(2027), 999_999).value()).isEqualTo("2027-999999");
    }

    @Test
    @DisplayName("Given a serial of a million or of zero, when a number is made, then it is refused")
    void should_refuse_when_made_given_serial_out_of_range() {
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptNumber.of(Year.of(2027), 1_000_000));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptNumber.of(Year.of(2027), 0));
    }

    @Test
    @DisplayName("Given a stored text, when it is read as a number, then only the YYYY-NNNNNN form is accepted")
    void should_accept_only_canonical_form_when_read_given_text() {
        assertThat(new ReceiptNumber("2026-000042").value()).isEqualTo("2026-000042");
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptNumber("2026-42"));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptNumber("26-000042"));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptNumber(null));
    }
}
