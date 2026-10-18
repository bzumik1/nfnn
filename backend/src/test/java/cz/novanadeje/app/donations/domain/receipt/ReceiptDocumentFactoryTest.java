package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.ACME_ADDRESS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FIRST_NUMBER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA_ADDRESS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.refundedToJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ReceiptDocumentFactoryTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);
    private static final Donation DECEMBER = receivedFromJana(LocalDate.of(2026, 12, 20), 100000);

    @Test
    @DisplayName("Given one received donation of a person, when its document is built, then it has one line, the amount as total and the person as donor")
    void should_build_single_document_when_built_given_received_donation_of_person() {
        ReceiptDocument document = ReceiptDocumentFactory.forDonation(jana(), MARCH, FOUNDATION, SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS,
                Optional.empty());

        assertThat(document.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(document.number()).isEqualTo(FIRST_NUMBER);
        assertThat(document.issuedOn()).isEqualTo(TODAY);
        assertThat(document.locale()).isEqualTo(LocaleCode.CS);
        assertThat(document.foundation()).isEqualTo(FOUNDATION);
        assertThat(document.signatory()).isEqualTo(SIGNATORY);
        assertThat(document.year()).isEmpty();
        assertThat(document.replaces()).isEmpty();
        assertThat(document.lines()).containsExactly(new ReceiptLine(MARCH.id(), MARCH.receivedOn(), Money.czk(50000), DonationSource.BANK_TRANSFER));
        assertThat(document.total()).isEqualTo(Money.czk(50000));
        assertThat(document.donor()).isEqualTo(new ReceiptParty(DonorType.PERSON, "Jana Nováková", JANA_ADDRESS, Optional.empty(),
                new VariableSymbol("4821937560")));
    }

    @Test
    @DisplayName("Given a year's donations newest first, when the yearly document is built, then the lines run oldest first and the total adds them up")
    void should_list_oldest_first_with_total_when_built_given_yearly_donations() {
        ReceiptDocument document = ReceiptDocumentFactory.forYear(jana(), YEAR_2026, List.of(DECEMBER, MARCH, JUNE), FOUNDATION, SIGNATORY,
                FIRST_NUMBER, TODAY, LocaleCode.EN, Optional.empty());

        assertThat(document.kind()).isEqualTo(ReceiptKind.YEARLY);
        assertThat(document.year()).contains(YEAR_2026);
        assertThat(document.lines()).extracting(ReceiptLine::donationId).containsExactly(MARCH.id(), JUNE.id(), DECEMBER.id());
        assertThat(document.total()).isEqualTo(Money.czk(275050));
        assertThat(document.locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a company's donation, when its document is built, then the donor is the company with its identification number")
    void should_carry_company_identifier_when_built_given_company_donor() {
        ReceiptDocument document = ReceiptDocumentFactory.forDonation(acme(), receivedFromAcme(LocalDate.of(2026, 5, 5), 1000000), FOUNDATION,
                SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty());

        assertThat(document.donor()).isEqualTo(new ReceiptParty(DonorType.COMPANY, "Acme Třebíč s.r.o.", ACME_ADDRESS, Optional.of("25596641"),
                new VariableSymbol("7310945528")));
    }

    @Test
    @DisplayName("Given a replaced receipt, when the document is built, then it names the receipt it replaces")
    void should_name_replaced_receipt_when_built_given_replacement() {
        ReplacedReceipt replaced = new ReplacedReceipt(FIRST_NUMBER, LocalDate.of(2027, 1, 10));

        ReceiptDocument document = ReceiptDocumentFactory.forYear(jana(), YEAR_2026, List.of(MARCH), FOUNDATION, SIGNATORY,
                ReceiptNumber.of(Year.of(2027), 2), TODAY, LocaleCode.CS, Optional.of(replaced));

        assertThat(document.replaces()).contains(replaced);
    }

    @Test
    @DisplayName("Given a refunded donation, when a document is built for it or its year, then it is refused")
    void should_refuse_when_built_given_refunded_donation() {
        Donation refunded = refundedToJana(LocalDate.of(2026, 4, 1), 20000);

        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptDocumentFactory.forDonation(jana(), refunded, FOUNDATION, SIGNATORY,
                FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptDocumentFactory.forYear(jana(), YEAR_2026, List.of(MARCH, refunded),
                FOUNDATION, SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
    }

    @Test
    @DisplayName("Given no donations, another year's donation or another donor's donation, when a yearly document is built, then it is refused")
    void should_refuse_when_built_given_empty_or_foreign_donations() {
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptDocumentFactory.forYear(jana(), YEAR_2026, List.of(), FOUNDATION, SIGNATORY,
                FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptDocumentFactory.forYear(jana(), YEAR_2026,
                List.of(MARCH, receivedFromJana(LocalDate.of(2025, 12, 31), 100)), FOUNDATION, SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS,
                Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> ReceiptDocumentFactory.forDonation(jana(), receivedFromAcme(MARCH.receivedOn(), 100),
                FOUNDATION, SIGNATORY, FIRST_NUMBER, TODAY, LocaleCode.CS, Optional.empty()));
    }
}
