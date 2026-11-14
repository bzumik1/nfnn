package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptDocumentTest {

    @Test
    @DisplayName("Given a total that differs from the sum of the lines, when the document is made, then the message names the rule without the amounts")
    void should_name_the_rule_without_the_amounts_when_made_given_total_other_than_sum() {
        ReceiptDocument document = singleDocument(jana(), receivedFromJana(LocalDate.of(2026, 11, 3), 873_100));

        assertThatIllegalArgumentException()
                .isThrownBy(() -> new ReceiptDocument(document.kind(), document.number(), document.issuedOn(), document.locale(),
                        document.foundation(), document.donor(), document.lines(), Money.czk(873_200), document.year(),
                        document.signatory(), document.replaces()))
                .withMessage("The total does not add up the lines")
                .satisfies(refused -> assertThat(refused.getMessage()).doesNotContain("8731", "8732", "8 731", "8 732"));
    }

    @Test
    @DisplayName("Given a yearly document of 2026 issued on 31 December 2026, when it is made, then the year is not completed yet")
    void should_refuse_when_made_given_yearly_document_issued_in_its_own_year() {
        assertThatThrownBy(() -> yearlyOf2026IssuedOn(LocalDate.of(2026, 12, 31)))
                .isInstanceOf(YearNotYetCompleted.class)
                .extracting("code").isEqualTo("donations/year-not-yet-completed");
    }

    @Test
    @DisplayName("Given a yearly document of 2026 issued before 2026 ended, when it is made, then the year is not completed yet")
    void should_refuse_when_made_given_yearly_document_issued_before_its_year_ended() {
        assertThatThrownBy(() -> yearlyOf2026IssuedOn(LocalDate.of(2026, 3, 20))).isInstanceOf(YearNotYetCompleted.class);
    }

    @Test
    @DisplayName("Given a yearly document of 2026 issued on 1 January 2027, when it is made, then it certifies the completed year")
    void should_make_document_when_made_given_yearly_document_issued_on_new_years_day_after_its_year() {
        assertThat(yearlyOf2026IssuedOn(LocalDate.of(2027, 1, 1)).year()).contains(Year.of(2026));
    }

    private static ReceiptDocument yearlyOf2026IssuedOn(LocalDate issuedOn) {
        return ReceiptDocumentFactory.forYear(jana(), Year.of(2026), List.of(receivedFromJana(LocalDate.of(2026, 3, 15), 50000)), FOUNDATION,
                SIGNATORY, FIRST_NUMBER, issuedOn, jana().preferredLocale(), Optional.empty());
    }
}
