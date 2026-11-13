package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

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
}
