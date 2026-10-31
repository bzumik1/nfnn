package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssueLimitReached;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptTooLong;
import cz.novanadeje.app.shared.domain.LocaleCode;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.receipt.Receipts.FOUNDATION;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SIGNATORY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DonationReceiptIssuerTest {

    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);
    private static final LocalDate EARLIER = LocalDate.of(2027, 1, 10);
    private static final Instant EARLIER_AT = Instant.parse("2027-01-10T08:00:00Z");

    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final ReceiptFreezer freezer = mock(ReceiptFreezer.class);
    private final ReceiptSignatureRepository signatures = mock(ReceiptSignatureRepository.class);
    private final DonationReceiptIssuer issuer = new DonationReceiptIssuer(receipts,
            new ReceiptRequestReader(donations, donorRecords, new FirstReceiptYear(YEAR_2026)), freezer, signatures, FOUNDATION, SIGNATORY,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given no receipt yet, when a single receipt is issued, then the donor is locked first, then the donation and the donor record are read, a new number is taken and the document is frozen, signed and stored as active")
    void should_issue_new_frozen_receipt_from_data_read_after_lock_when_issued_given_no_receipt() {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForDonation(JANA, MARCH.id(), TODAY);

        InOrder order = inOrder(receipts, donations, donorRecords, freezer);
        order.verify(receipts).lockDonor(JANA);
        order.verify(donations).findByIdForDonor(MARCH.id(), JANA);
        order.verify(donorRecords).findById(JANA);
        order.verify(receipts).findActiveForDonation(MARCH.id());
        order.verify(receipts).nextSerial();
        order.verify(freezer).freeze(any(), any());
        order.verify(receipts).save(any());
        DonationReceipt saved = savedReceipt();
        assertThat(saved).isSameAs(issued);
        assertThat(saved.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(saved.donor()).isEqualTo(JANA);
        assertThat(saved.donation()).contains(MARCH.id());
        assertThat(saved.number()).isEqualTo(new ReceiptNumber("2027-000001"));
        assertThat(saved.issuedOn()).isEqualTo(TODAY);
        assertThat(saved.issuedAt()).isEqualTo(NOW);
        assertThat(saved.locale()).isEqualTo(LocaleCode.CS);
        assertThat(saved.fingerprint()).isEqualTo(ReceiptDocumentFactory.fingerprintForDonation(jana(), MARCH));
        assertThat(saved.status()).isEqualTo(ReceiptStatus.ACTIVE);
        assertThat(saved.supersedes()).isEmpty();
        assertThat(saved.frozen().document()).isEqualTo(frozenDocument());
        assertThat(saved.frozen().signatureImage()).isEmpty();
        assertThat(frozenDocument().replaces()).isEmpty();
        assertThat(frozenDocument().number()).isEqualTo(new ReceiptNumber("2027-000001"));
        assertThat(frozenDocument().signatory()).isEqualTo(SIGNATORY);
        assertThat(frozenDocument().foundation()).isEqualTo(FOUNDATION);
    }

    @Test
    @DisplayName("Given an active receipt certifying the same data, when issued again, then that receipt is returned and nothing is numbered, frozen, signed or saved")
    void should_return_active_receipt_when_issued_given_equal_fingerprint() {
        ReceiptFingerprint same = ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE));
        DonationReceipt active = yearlyReceipt(same, LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));

        DonationReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        assertThat(issued).isSameAs(active);
        verify(receipts).lockDonor(JANA);
        verify(receipts, never()).nextSerial();
        verify(receipts, never()).countReplacementsIssuedAfter(any(), any());
        verify(receipts, never()).save(any());
        verifyNoInteractions(freezer, signatures);
    }

    @Test
    @DisplayName("Given an active receipt certifying other data, when issued, then a replacement with a new number names the old one, which is replaced first")
    void should_replace_receipt_when_issued_given_different_fingerprint() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(2L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        ArgumentCaptor<DonationReceipt> saved = ArgumentCaptor.forClass(DonationReceipt.class);
        verify(receipts, times(2)).save(saved.capture());
        DonationReceipt superseded = saved.getAllValues().get(0);
        DonationReceipt replacement = saved.getAllValues().get(1);
        assertThat(superseded.id()).isEqualTo(active.id());
        assertThat(superseded.status()).isEqualTo(ReceiptStatus.REPLACED);
        assertThat(superseded.supersededAt()).contains(NOW);
        assertThat(replacement).isSameAs(issued);
        assertThat(replacement.number()).isEqualTo(new ReceiptNumber("2027-000002"));
        assertThat(replacement.supersedes()).contains(active.id());
        assertThat(replacement.year()).contains(YEAR_2026);
        assertThat(replacement.isActive()).isTrue();
        assertThat(frozenDocument().replaces()).contains(new ReplacedReceipt(active.number(), EARLIER));
        assertThat(frozenDocument().lines()).hasSize(2);
    }

    @Test
    @DisplayName("Given an English receipt being replaced for a donor who now prefers Czech, when issued, then the replacement stays English")
    void should_keep_locale_of_replaced_receipt_when_issued_given_changed_preference() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.EN);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(3L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        assertThat(frozenDocument().locale()).isEqualTo(LocaleCode.EN);
        assertThat(issued.locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a donor who prefers English and no receipt yet, when issued, then the receipt is English")
    void should_use_preferred_locale_when_issued_given_first_receipt() {
        DonorRecord english = jana();
        english.changeProfile(english.name(), english.address(), LocaleCode.EN, NOW);
        givenDonationsOfJana(english, MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenFreezer();

        assertThat(issuer.issueForDonation(JANA, MARCH.id(), TODAY).locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given an uploaded signature, when a receipt is issued, then the frozen receipt names the digest of the signature image")
    void should_freeze_signature_image_digest_when_issued_given_uploaded_signature() {
        SignatureImage image = new SignatureImage(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 1, 2, 3}, 600, 200);
        when(signatures.current()).thenReturn(Optional.of(new CurrentSignature(image, NOW.minusSeconds(3600))));
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForDonation(JANA, MARCH.id(), TODAY);

        verify(freezer).freeze(any(), eq(Optional.of(image.digest())));
        assertThat(issued.frozen().signatureImage()).contains(image.digest());
    }

    @Test
    @DisplayName("Given a receipt whose proof does not fit a QR code, when issued, then the refusal propagates and nothing is saved or replaced")
    void should_save_nothing_when_issued_given_proof_too_long() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(4L);
        when(freezer.freeze(any(), any())).thenThrow(new ReceiptTooLong());

        assertThatThrownBy(() -> issuer.issueForYear(JANA, YEAR_2026, TODAY)).isInstanceOf(ReceiptTooLong.class);
        verify(receipts, never()).save(any());
        assertThat(active.isActive()).isTrue();
    }

    @Test
    @DisplayName("Given 20 replacements issued to the donor in the last 24 hours, when a receipt with changed data is issued, then it is refused before a number is taken and the active receipt stays active")
    void should_refuse_before_numbering_when_issued_given_twenty_replacements_in_a_day() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.countReplacementsIssuedAfter(JANA, NOW.minus(Duration.ofHours(24)))).thenReturn(20L);

        assertThatThrownBy(() -> issuer.issueForYear(JANA, YEAR_2026, TODAY))
                .isInstanceOfSatisfying(ReceiptIssueLimitReached.class, refused -> assertThat(refused.code()).isEqualTo("donations/receipt-issue-limit"));

        InOrder order = inOrder(receipts);
        order.verify(receipts).lockDonor(JANA);
        order.verify(receipts).countReplacementsIssuedAfter(JANA, NOW.minus(Duration.ofHours(24)));
        verify(receipts, never()).nextSerial();
        verify(receipts, never()).save(any());
        verifyNoInteractions(freezer);
        assertThat(active.isActive()).isTrue();
    }

    @Test
    @DisplayName("Given 19 replacements issued to the donor in the last 24 hours, when a receipt with changed data is issued, then the replacement is numbered and stored")
    void should_replace_when_issued_given_nineteen_replacements_in_a_day() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.countReplacementsIssuedAfter(JANA, NOW.minus(Duration.ofHours(24)))).thenReturn(19L);
        when(receipts.nextSerial()).thenReturn(20L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        assertThat(issued.number()).isEqualTo(new ReceiptNumber("2027-000020"));
        assertThat(issued.supersedes()).contains(active.id());
        verify(receipts, times(2)).save(any());
    }

    @Test
    @DisplayName("Given no receipt yet for the year and 20 replacements issued to the donor in the last 24 hours, when the receipt is issued, then it is numbered and stored without the replacements being counted")
    void should_issue_without_counting_when_issued_given_first_issue() {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.countReplacementsIssuedAfter(any(), any())).thenReturn(20L);
        when(receipts.nextSerial()).thenReturn(20L);
        givenFreezer();

        assertThat(issuer.issueForYear(JANA, YEAR_2026, TODAY).number()).isEqualTo(new ReceiptNumber("2027-000020"));
        verify(receipts, never()).countReplacementsIssuedAfter(any(), any());
        verify(receipts).save(any());
    }

    @Test
    @DisplayName("Given the first of January, when a receipt is issued, then its number carries the new year")
    void should_number_with_year_of_issue_when_issued_given_new_year() {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(17L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForYear(JANA, YEAR_2026, LocalDate.of(2027, 1, 1));

        assertThat(issued.number()).isEqualTo(ReceiptNumber.of(Year.of(2027), 17));
        assertThat(savedReceipt().issuedOn()).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    @Test
    @DisplayName("Given a completed year, when its yearly receipt is issued, then the donor is locked before the year's donations, the donor record and the active receipt are read")
    void should_read_certified_data_after_lock_when_issued_given_yearly_receipt() {
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(5L);
        givenFreezer();

        issuer.issueForYear(JANA, YEAR_2026, TODAY);

        InOrder order = inOrder(receipts, donations, donorRecords);
        order.verify(receipts).lockDonor(JANA);
        order.verify(donations).findByDonorNewestFirst(JANA);
        order.verify(donorRecords).findById(JANA);
        order.verify(receipts).findActiveForYear(JANA, YEAR_2026);
        assertThat(savedReceipt().fingerprint()).isEqualTo(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE)));
    }

    @Test
    @DisplayName("Given a donation that is not the caller's or does not exist, when its receipt is issued, then it is not found under the lock and nothing is numbered, frozen or saved")
    void should_not_find_donation_under_lock_when_issued_given_other_donors_or_unknown_id() {
        DonationId foreign = DonationId.newId(NOW);
        when(donations.findByIdForDonor(foreign, JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> issuer.issueForDonation(JANA, foreign, TODAY)).isInstanceOf(DonationNotFound.class);

        InOrder order = inOrder(receipts, donations);
        order.verify(receipts).lockDonor(JANA);
        order.verify(donations).findByIdForDonor(foreign, JANA);
        verify(receipts, never()).nextSerial();
        verify(receipts, never()).save(any());
        verifyNoInteractions(freezer);
    }

    @ParameterizedTest(name = "Given serial {0}, when a new receipt takes it, then {1} warnings say the numbering is running out")
    @CsvSource({"899999, 0", "900000, 1", "999999, 1"})
    @DisplayName("Given a serial near the end of the numbering, when a new receipt takes it, then a warning says so from 90 % on")
    void should_warn_that_numbering_runs_out_when_issued_given_serial_past_ninety_percent(long serial, int warnings) {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(serial);
        givenFreezer();
        Logger logger = (Logger) LoggerFactory.getLogger(DonationReceiptIssuer.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            issuer.issueForYear(JANA, YEAR_2026, TODAY);
        } finally {
            logger.detachAppender(logs);
        }

        assertThat(logs.list).filteredOn(event -> event.getLevel() == Level.WARN)
                .extracting(ILoggingEvent::getFormattedMessage)
                .hasSize(warnings)
                .allSatisfy(message -> assertThat(message).isEqualTo("Receipt serial " + serial + " has passed 90 % of the numbering, which ends at 999999"));
    }

    private DonationReceipt yearlyReceipt(ReceiptFingerprint fingerprint, LocaleCode locale) {
        ReceiptDocument document = ReceiptDocumentFactory.forYear(jana(), YEAR_2026, List.of(MARCH), FOUNDATION, SIGNATORY,
                new ReceiptNumber("2027-000001"), EARLIER, locale, Optional.empty());
        return DonationReceipt.issue(DonationReceiptId.newId(EARLIER_AT), JANA, EARLIER_AT, fingerprint, Receipts.frozen(document), Optional.empty());
    }

    private void givenDonationsOfJana(DonorRecord record, Donation... newestFirst) {
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(newestFirst));
        for (Donation donation : newestFirst) {
            when(donations.findByIdForDonor(donation.id(), JANA)).thenReturn(Optional.of(donation));
        }
    }

    private void givenFreezer() {
        when(freezer.freeze(any(), any())).thenAnswer(call -> {
            ReceiptDocument document = call.getArgument(0);
            Optional<ContentDigest> signature = call.getArgument(1);
            FrozenReceipt frozen = Receipts.frozen(document, signature);
            return frozen;
        });
    }

    private DonationReceipt savedReceipt() {
        ArgumentCaptor<DonationReceipt> saved = ArgumentCaptor.forClass(DonationReceipt.class);
        verify(receipts).save(saved.capture());
        return saved.getValue();
    }

    private ReceiptDocument frozenDocument() {
        ArgumentCaptor<ReceiptDocument> frozen = ArgumentCaptor.forClass(ReceiptDocument.class);
        verify(freezer).freeze(frozen.capture(), any());
        return frozen.getValue();
    }
}
