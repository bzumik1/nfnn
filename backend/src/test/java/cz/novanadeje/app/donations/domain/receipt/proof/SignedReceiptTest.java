package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.domain.DonorType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SignedReceiptTest {

    private static final String NAME = "Žofie Šťastná";
    private static final ReceiptSigningKeyId KEY = new ReceiptSigningKeyId("21fe31df");

    @Test
    @DisplayName("Given a name written in decomposed form, when the receipt is encoded and parsed back, then it carries the composed form")
    void should_carry_composed_name_when_encoded_given_decomposed_name() {
        SignedReceipt receipt = single(Normalizer.normalize(NAME, Normalizer.Form.NFD), List.of(new SignedGift(LocalDate.parse("2026-11-03"), 250000)), 250000);

        assertThat(ReceiptProofBody.parse(ReceiptProofBody.encode(receipt, KEY)).donor().name()).isEqualTo(NAME);
        assertThat(receipt).isEqualTo(single(NAME, List.of(new SignedGift(LocalDate.parse("2026-11-03"), 250000)), 250000));
    }

    @Test
    @DisplayName("Given gifts whose sum differs from the total, when the receipt is made, then it is refused")
    void should_refuse_when_made_given_total_other_than_sum() {
        assertThatIllegalArgumentException().isThrownBy(() -> single(NAME, List.of(new SignedGift(LocalDate.parse("2026-11-03"), 250000)), 250001));
    }

    @Test
    @DisplayName("Given a number of another year than the issue date, when the receipt is made, then it is refused")
    void should_refuse_when_made_given_number_of_another_year() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SignedReceipt(ReceiptKind.SINGLE, new ReceiptNumber("2025-000042"), LocalDate.parse("2026-11-05"),
                Optional.empty(), Optional.empty(), donor(NAME), List.of(new SignedGift(LocalDate.parse("2026-11-03"), 100)), 100));
    }

    @Test
    @DisplayName("Given a yearly receipt with a gift of another year, when the receipt is made, then it is refused")
    void should_refuse_when_made_given_yearly_receipt_with_gift_of_another_year() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SignedReceipt(ReceiptKind.YEARLY, new ReceiptNumber("2027-000123"), LocalDate.parse("2027-01-15"),
                Optional.of(Year.of(2026)), Optional.empty(), donor(NAME), List.of(new SignedGift(LocalDate.parse("2025-12-31"), 100)), 100));
    }

    @Test
    @DisplayName("Given a company without its identifier or a person with one, when the donor is made, then it is refused")
    void should_refuse_when_donor_is_made_given_identifier_not_matching_type() {
        assertThatIllegalArgumentException().isThrownBy(() -> new SignedDonor(DonorType.COMPANY, "Pekárna s.r.o.", "Mlýnská 7", "Turnov", "511 01", Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> new SignedDonor(DonorType.PERSON, NAME, "Lipová 12", "Liberec", "460 01", Optional.of("01234567")));
    }

    private static SignedReceipt single(String name, List<SignedGift> gifts, long total) {
        return new SignedReceipt(ReceiptKind.SINGLE, new ReceiptNumber("2026-000042"), LocalDate.parse("2026-11-05"), Optional.empty(), Optional.empty(),
                donor(name), gifts, total);
    }

    private static SignedDonor donor(String name) {
        return new SignedDonor(DonorType.PERSON, name, "Lipová 12", "Liberec", "460 01", Optional.empty());
    }
}
