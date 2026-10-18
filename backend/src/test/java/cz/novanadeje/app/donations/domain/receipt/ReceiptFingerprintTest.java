package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA_ADDRESS;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.singleDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyDocument;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ReceiptFingerprintTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);

    @Test
    @DisplayName("Given the same certified data, when fingerprinted twice, then the hash is the same 64 lowercase hex characters")
    void should_be_same_hex_hash_when_fingerprinted_given_same_data() {
        ReceiptFingerprint first = ReceiptFingerprint.of(yearlyDocument(jana(), List.of(MARCH, JUNE)));
        ReceiptFingerprint second = ReceiptFingerprint.of(yearlyDocument(jana(), List.of(JUNE, MARCH)));

        assertThat(first).isEqualTo(second);
        assertThat(first.value()).matches("[0-9a-f]{64}");
    }

    @Test
    @DisplayName("Given a request's data, when the factory fingerprints it before any number exists, then it equals the fingerprint of the document")
    void should_equal_document_fingerprint_when_fingerprinted_from_request_given_same_data() {
        assertThat(ReceiptDocumentFactory.fingerprintForDonation(jana(), MARCH)).isEqualTo(ReceiptFingerprint.of(singleDocument(jana(), MARCH)));
        assertThat(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE)))
                .isEqualTo(ReceiptFingerprint.of(yearlyDocument(jana(), List.of(MARCH, JUNE))));
    }

    @Test
    @DisplayName("Given a different number, issue date, locale, signatory, foundation or replaced receipt, when fingerprinted, then the hash does not change")
    void should_ignore_what_is_not_certified_when_fingerprinted_given_other_document_details() {
        ReceiptFingerprint original = ReceiptFingerprint.of(singleDocument(jana(), MARCH));
        FoundationIdentity otherFoundation = new FoundationIdentity("Jiný fond", "12345678", new PostalAddress("Jiná 1", "Praha", "110 00"),
                "Městský soud v Praze", "N 1", "19-2000145399/0800", "V Praze", "Prague");

        ReceiptDocument other = ReceiptDocumentFactory.forDonation(jana(), MARCH, otherFoundation, new Signatory("Eva Malá", "členka správní rady"),
                ReceiptNumber.of(Year.of(2028), 77), TODAY.plusYears(1), LocaleCode.EN,
                Optional.of(new ReplacedReceipt(Receipts.FIRST_NUMBER, TODAY)));

        assertThat(ReceiptFingerprint.of(other)).isEqualTo(original);
    }

    @Test
    @DisplayName("Given each certified field changed in turn, when fingerprinted, then every change gives another hash")
    void should_change_hash_when_fingerprinted_given_each_certified_field_changed() {
        ReceiptFingerprint original = ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE));

        assertThat(List.of(
                ReceiptDocumentFactory.fingerprintForYear(renamed("Jana Veselá"), YEAR_2026, List.of(MARCH, JUNE)),
                ReceiptDocumentFactory.fingerprintForYear(moved(new PostalAddress("Krátká 1", "Ústí nad Labem", "400 01")), YEAR_2026, List.of(MARCH, JUNE)),
                ReceiptDocumentFactory.fingerprintForYear(moved(new PostalAddress("Dlouhá 12", "Děčín", "400 01")), YEAR_2026, List.of(MARCH, JUNE)),
                ReceiptDocumentFactory.fingerprintForYear(moved(new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 02")), YEAR_2026, List.of(MARCH, JUNE)),
                ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)),
                ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, receivedFromJana(LocalDate.of(2026, 6, 1), 125050))),
                ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, sameIdOtherDay(JUNE))),
                ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, sameIdOtherAmount(JUNE)))))
                .doesNotContain(original)
                .doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("Given the same donation, when certified alone or within its year, then the kind and its subject change the hash")
    void should_change_hash_when_fingerprinted_given_other_kind_or_subject() {
        ReceiptFingerprint single = ReceiptDocumentFactory.fingerprintForDonation(jana(), MARCH);
        ReceiptFingerprint yearly = ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH));
        ReceiptFingerprint otherDonation = ReceiptDocumentFactory.fingerprintForDonation(jana(), receivedFromJana(MARCH.receivedOn(), 50000));

        assertThat(List.of(single, yearly, otherDonation)).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("Given a person and a company or two company identifiers, when fingerprinted, then the donor type and the identifier change the hash")
    void should_change_hash_when_fingerprinted_given_other_donor_type_or_identifier() {
        ReceiptParty person = new ReceiptParty(DonorType.PERSON, "Acme Třebíč s.r.o.", JANA_ADDRESS, Optional.empty(), new VariableSymbol("1"));
        ReceiptParty company = new ReceiptParty(DonorType.COMPANY, "Acme Třebíč s.r.o.", JANA_ADDRESS, Optional.of("25596641"), new VariableSymbol("1"));
        ReceiptParty otherCompany = new ReceiptParty(DonorType.COMPANY, "Acme Třebíč s.r.o.", JANA_ADDRESS, Optional.of("25596642"), new VariableSymbol("1"));
        List<ReceiptLine> lines = ReceiptDocumentFactory.lines(List.of(MARCH));

        assertThat(List.of(
                ReceiptFingerprint.of(ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2026), person, lines, MARCH.amount()),
                ReceiptFingerprint.of(ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2026), company, lines, MARCH.amount()),
                ReceiptFingerprint.of(ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2026), otherCompany, lines, MARCH.amount()),
                ReceiptFingerprint.of(ReceiptKind.YEARLY, Optional.empty(), Optional.of(Year.of(2025)), person, lines, MARCH.amount()),
                ReceiptFingerprint.of(ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2026), person, lines, Money.czk(50001))))
                .doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("Given a text that is not 64 lowercase hex characters, when read as a fingerprint, then it is refused")
    void should_refuse_when_read_given_malformed_text() {
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptFingerprint("abc"));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptFingerprint("G".repeat(64)));
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptFingerprint(null));
    }

    private static DonorRecord renamed(String name) {
        DonorRecord record = jana();
        record.changeProfile(name, record.address(), record.preferredLocale(), NOW);
        return record;
    }

    private static DonorRecord moved(PostalAddress address) {
        DonorRecord record = jana();
        record.changeProfile(record.name(), address, record.preferredLocale(), NOW);
        return record;
    }

    private static Donation sameIdOtherDay(Donation donation) {
        return Donation.reconstitute(donation.id(), donation.donor(), donation.bankPayment(), donation.receivedOn().plusDays(1),
                donation.amount(), donation.source(), donation.status(), donation.pairedBy(), donation.recordedAt());
    }

    private static Donation sameIdOtherAmount(Donation donation) {
        return Donation.reconstitute(donation.id(), donation.donor(), donation.bankPayment(), donation.receivedOn(),
                Money.czk(donation.amount().amountMinor() + 1), donation.source(), donation.status(), donation.pairedBy(), donation.recordedAt());
    }

    @Test
    @DisplayName("Given a change of the preferred language only, when fingerprinted, then the hash stays")
    void should_keep_hash_when_fingerprinted_given_only_locale_changed() {
        DonorRecord english = jana();
        english.changeProfile(english.name(), english.address(), LocaleCode.EN, NOW);

        assertThat(ReceiptDocumentFactory.fingerprintForDonation(english, MARCH)).isEqualTo(ReceiptDocumentFactory.fingerprintForDonation(jana(), MARCH));
    }
}
