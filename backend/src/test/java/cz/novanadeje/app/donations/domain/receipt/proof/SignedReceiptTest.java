package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import cz.novanadeje.app.donations.domain.receipt.ReceiptParty;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
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

    @Test
    @DisplayName("Given a yearly document replacing an earlier receipt, when it is signed, then the signed receipt carries its kind, number, issue day, year, replaced receipt, donor, every gift by day in hellers and the total")
    void should_carry_every_signed_part_when_signed_given_yearly_replacement_document() {
        Donation march = receivedFromJana(LocalDate.parse("2026-03-15"), 50000);
        Donation june = receivedFromJana(LocalDate.parse("2026-06-01"), 125050);
        ReplacedReceipt replaced = new ReplacedReceipt(new ReceiptNumber("2027-000001"), LocalDate.parse("2027-01-10"));
        ReceiptDocument document = ReceiptDocumentFactory.forYear(jana(), Year.of(2026), List.of(june, march), FOUNDATION, SIGNATORY,
                new ReceiptNumber("2027-000002"), TODAY, LocaleCode.CS, Optional.of(replaced));

        SignedReceipt signed = SignedReceipt.of(document);

        assertThat(signed).isEqualTo(new SignedReceipt(ReceiptKind.YEARLY, new ReceiptNumber("2027-000002"), TODAY, Optional.of(Year.of(2026)),
                Optional.of(replaced), new SignedDonor(DonorType.PERSON, "Jana Nováková", "Dlouhá 12", "Ústí nad Labem", "400 01", Optional.empty()),
                List.of(new SignedGift(LocalDate.parse("2026-03-15"), 50000), new SignedGift(LocalDate.parse("2026-06-01"), 125050)), 175050));
    }

    @Test
    @DisplayName("Given a company's single document, when it is signed, then the signed donor carries the company identifier and its seat")
    void should_carry_company_identifier_when_signed_given_company_document() {
        Donation gift = receivedFromAcme(LocalDate.parse("2026-09-30"), 2500000);

        SignedReceipt signed = SignedReceipt.of(singleDocument(acme(), gift));

        assertThat(signed.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(signed.year()).isEmpty();
        assertThat(signed.replaces()).isEmpty();
        assertThat(signed.donor()).isEqualTo(new SignedDonor(DonorType.COMPANY, "Acme Třebíč s.r.o.", "Průmyslová 5", "Česká Lípa", "470 01",
                Optional.of("25596641")));
        assertThat(signed.gifts()).containsExactly(new SignedGift(LocalDate.parse("2026-09-30"), 2500000));
        assertThat(signed.totalMinor()).isEqualTo(2500000);
    }

    @Test
    @DisplayName("Given two documents that differ only in what is not signed (locale, signatory, variable symbol, foundation's texts, gift source), when they are signed, then the signed receipts are equal")
    void should_sign_equal_receipts_when_signed_given_documents_differing_only_in_unsigned_parts() {
        Donation march = receivedFromJana(LocalDate.parse("2026-03-15"), 50000);
        ReceiptDocument czech = singleDocument(jana(), march);
        ReceiptDocument english = new ReceiptDocument(czech.kind(), czech.number(), czech.issuedOn(), LocaleCode.EN,
                new FoundationIdentity("Jiný fond", "12345678", czech.foundation().address(), "Jiný soud", "N 1", "1/0100", "Jinde", "Elsewhere"),
                new ReceiptParty(DonorType.PERSON, "Jana Nováková", czech.donor().address(), Optional.empty(), new VariableSymbol("111")),
                List.of(new ReceiptLine(march.id(), march.receivedOn(), march.amount(), DonationSource.MANUAL)), czech.total(), czech.year(),
                new Signatory("Petr Vzorový", "pokladník"), czech.replaces());

        assertThat(SignedReceipt.of(english)).isEqualTo(SignedReceipt.of(czech));
    }

    private static SignedReceipt single(String name, List<SignedGift> gifts, long total) {
        return new SignedReceipt(ReceiptKind.SINGLE, new ReceiptNumber("2026-000042"), LocalDate.parse("2026-11-05"), Optional.empty(), Optional.empty(),
                donor(name), gifts, total);
    }

    private static SignedDonor donor(String name) {
        return new SignedDonor(DonorType.PERSON, name, "Lipová 12", "Liberec", "460 01", Optional.empty());
    }
}
