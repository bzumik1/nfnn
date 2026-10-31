package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordErased;
import cz.novanadeje.app.donations.domain.donor.DonorRecordNotFound;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
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
import cz.novanadeje.app.donations.domain.receipt.ReceiptReplacementInBrowserOnly;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptUnprintable;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptTooLong;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static cz.novanadeje.app.donations.application.receipt.AdministrationChannel.BROWSER;
import static cz.novanadeje.app.donations.application.receipt.AdministrationChannel.CONNECTED_APPLICATION;
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
import static org.mockito.Mockito.atLeastOnce;
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
    private final ReceiptSigningKeys signingKeys = mock(ReceiptSigningKeys.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final DonationReceiptIssuer issuer = new DonationReceiptIssuer(receipts,
            new ReceiptRequestReader(donations, donorRecords, new FirstReceiptYear(YEAR_2026)), freezer, signatures, signingKeys, FOUNDATION, SIGNATORY, events,
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
    @DisplayName("Given the server's own signing key withdrawn and not yet replaced, when a single receipt is issued, then it is refused as paused before the donor is locked, nothing is read, numbered or saved and a WARN names the donor and the key")
    void should_refuse_before_lock_and_warn_when_issued_given_own_key_withdrawn() {
        when(signingKeys.withdrawnCurrentKeyHeldForIssuing()).thenReturn(Optional.of(new ReceiptSigningKeyId("21fe31df")));
        ListAppender<ILoggingEvent> lines = issuerLog();
        try {
            assertThatThrownBy(() -> issuer.issueForDonation(JANA, MARCH.id(), TODAY)).isInstanceOf(ReceiptSigningPaused.class)
                    .hasFieldOrPropertyWithValue("code", "donations/receipt-signing-paused");
        } finally {
            ((Logger) LoggerFactory.getLogger(DonationReceiptIssuer.class)).detachAppender(lines);
        }

        verifyNoInteractions(receipts, donations, donorRecords, freezer, signatures);
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("No receipt is issued to donor " + JANA
                    + ": the receipt signing key 21fe31df of this server is withdrawn and no new seed has replaced it");
        });
    }

    @Test
    @DisplayName("Given the server's own signing key withdrawn and an active receipt certifying the same data, when the yearly receipt is issued again, then it is refused as paused instead of being returned")
    void should_refuse_returning_active_receipt_when_issued_again_given_own_key_withdrawn() {
        ReceiptFingerprint same = ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE));
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(yearlyReceipt(same, LocaleCode.CS)));
        when(signingKeys.withdrawnCurrentKeyHeldForIssuing()).thenReturn(Optional.of(new ReceiptSigningKeyId("21fe31df")));

        assertThatThrownBy(() -> issuer.issueForYear(JANA, YEAR_2026, TODAY)).isInstanceOf(ReceiptSigningPaused.class);

        verify(receipts, never()).lockDonor(any());
        verify(receipts, never()).findActiveForYear(any(), any());
        verify(receipts, never()).save(any());
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
        when(signatures.currentDigest()).thenReturn(Optional.of(image.digest()));
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForDonation(JANA, MARCH.id(), TODAY);

        verify(freezer).freeze(any(), eq(Optional.of(image.digest())));
        assertThat(issued.frozen().signatureImage()).contains(image.digest());
    }

    @Test
    @DisplayName("Given an uploaded vector signature, when a receipt is issued, then the frozen receipt names the digest of its canonical JSON without the vector being read")
    void should_freeze_vector_digest_without_reading_it_when_issued_given_uploaded_vector_signature() {
        ContentDigest vector = ContentDigest.of("{\"viewBox\":[0,0,300,100],\"paths\":[]}".getBytes(StandardCharsets.UTF_8));
        when(signatures.currentDigest()).thenReturn(Optional.of(vector));
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenFreezer();

        DonationReceipt issued = issuer.issueForDonation(JANA, MARCH.id(), TODAY);

        verify(freezer).freeze(any(), eq(Optional.of(vector)));
        verify(signatures, never()).current();
        assertThat(issued.frozen().signatureImage()).contains(vector);
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

    @Test
    @DisplayName("Given a donor issuing their own receipt, when a new receipt is issued, then no administrator action is published")
    void should_publish_no_admin_action_when_issued_given_donor_issuing() {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenFreezer();

        issuer.issueForDonation(JANA, MARCH.id(), TODAY);

        verifyNoInteractions(events);
    }

    @Nested
    @DisplayName("Given an administrator issuing a donor's receipt")
    class ByAdministrator {

        private final UUID petr = UUID.fromString("0192f0f1-0000-7000-8000-00000000beef");

        @Test
        @DisplayName("when a yearly receipt is newly issued, then it is issued as for the donor and audited under the administrator with its number and year")
        void should_audit_new_yearly_receipt_when_issued_by_administrator() {
            givenDonationsOfJana(jana(), JUNE, MARCH);
            when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
            when(receipts.nextSerial()).thenReturn(1L);
            givenFreezer();

            DonationReceipt issued = issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY);

            InOrder order = inOrder(receipts, donorRecords, events);
            order.verify(receipts).lockDonor(JANA);
            order.verify(donorRecords, atLeastOnce()).findById(JANA);
            order.verify(receipts).save(issued);
            order.verify(events).publishEvent(new AdminActionPerformed(petr, "ISSUE_RECEIPT", Optional.of(issued.id().value()),
                    "Potvrzení 2027-000001 za rok 2026 vystaveno dárci " + JANA.value(), NOW));
            assertThat(issued.year()).contains(YEAR_2026);
            assertThat(issued.donor()).isEqualTo(JANA);
        }

        @Test
        @DisplayName("when the receipt of one donation is newly issued, then it is audited with the donation it certifies")
        void should_audit_new_single_receipt_when_issued_by_administrator() {
            givenDonationsOfJana(jana(), MARCH);
            when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
            when(receipts.nextSerial()).thenReturn(4L);
            givenFreezer();

            DonationReceipt issued = issuer.issueForDonationByAdministrator(petr, BROWSER, JANA, MARCH.id(), TODAY);

            verify(events).publishEvent(new AdminActionPerformed(petr, "ISSUE_RECEIPT", Optional.of(issued.id().value()),
                    "Potvrzení 2027-000004 za dar " + MARCH.id().value() + " vystaveno dárci " + JANA.value(), NOW));
        }

        @Test
        @DisplayName("when changed data brings a replacement, then the audit names the receipt it replaces")
        void should_audit_replacement_with_replaced_number_when_issued_by_administrator() {
            DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
            givenDonationsOfJana(jana(), JUNE, MARCH);
            when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
            when(receipts.nextSerial()).thenReturn(2L);
            givenFreezer();

            DonationReceipt issued = issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY);

            assertThat(issued.supersedes()).contains(active.id());
            verify(events).publishEvent(new AdminActionPerformed(petr, "ISSUE_RECEIPT", Optional.of(issued.id().value()),
                    "Potvrzení 2027-000002 za rok 2026 vystaveno dárci " + JANA.value() + "; nahrazuje potvrzení 2027-000001", NOW));
        }

        @Test
        @DisplayName("when the active receipt still certifies the same data, then it is returned and nothing is numbered or audited")
        void should_return_active_receipt_without_audit_when_issued_by_administrator_given_unchanged_data() {
            DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE)), LocaleCode.CS);
            givenDonationsOfJana(jana(), JUNE, MARCH);
            when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));

            assertThat(issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY)).isSameAs(active);

            verify(receipts, never()).nextSerial();
            verify(receipts, never()).save(any());
            verifyNoInteractions(events);
        }

        @Test
        @DisplayName("when the server's own signing key is withdrawn and not yet replaced, then both kinds of receipt are refused as paused before the donor is locked and nothing is read, numbered, saved or audited")
        void should_refuse_before_lock_when_issued_by_administrator_given_own_key_withdrawn() {
            when(signingKeys.withdrawnCurrentKeyHeldForIssuing()).thenReturn(Optional.of(new ReceiptSigningKeyId("21fe31df")));

            assertThatThrownBy(() -> issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY)).isInstanceOf(ReceiptSigningPaused.class);
            assertThatThrownBy(() -> issuer.issueForDonationByAdministrator(petr, CONNECTED_APPLICATION, JANA, MARCH.id(), TODAY))
                    .isInstanceOf(ReceiptSigningPaused.class);

            verifyNoInteractions(receipts, donations, donorRecords, freezer, signatures, events);
        }

        @Test
        @DisplayName("when the donor's record is erased, then it is refused under the lock and nothing is numbered, saved or audited")
        void should_refuse_erased_donor_under_lock_when_issued_by_administrator() {
            DonorRecord erased = jana();
            erased.erase(NOW);
            givenDonationsOfJana(erased, MARCH);

            assertThatThrownBy(() -> issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY)).isInstanceOf(DonorRecordErased.class);
            assertThatThrownBy(() -> issuer.issueForDonationByAdministrator(petr, BROWSER, JANA, MARCH.id(), TODAY)).isInstanceOf(DonorRecordErased.class);

            InOrder order = inOrder(receipts, donorRecords);
            order.verify(receipts).lockDonor(JANA);
            order.verify(donorRecords).findById(JANA);
            verify(receipts, never()).nextSerial();
            verify(receipts, never()).save(any());
            verifyNoInteractions(events, freezer);
        }

        @Test
        @DisplayName("when the donor has no record in donations, then it is not found and nothing is numbered or audited")
        void should_not_find_unknown_donor_when_issued_by_administrator() {
            when(donorRecords.findById(JANA)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY)).isInstanceOf(DonorRecordNotFound.class);

            verify(receipts, never()).nextSerial();
            verifyNoInteractions(events, freezer);
        }

        @Test
        @DisplayName("when the donor already got 20 replacements in 24 hours, then the same cap refuses another replacement and nothing is audited")
        void should_share_donor_cap_when_issued_by_administrator() {
            DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
            givenDonationsOfJana(jana(), JUNE, MARCH);
            when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
            when(receipts.countReplacementsIssuedAfter(eq(JANA), any())).thenReturn(20L);

            assertThatThrownBy(() -> issuer.issueForYearByAdministrator(petr, BROWSER, JANA, YEAR_2026, TODAY)).isInstanceOf(ReceiptIssueLimitReached.class);

            verify(receipts, never()).nextSerial();
            verifyNoInteractions(events);
        }

        @Test
        @DisplayName("when a connected application asks for a receipt changed data would replace, then it is refused before the cap and nothing is numbered, saved or audited")
        void should_refuse_replacement_before_cap_when_issued_by_connected_application_given_changed_data() {
            DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
            givenDonationsOfJana(jana(), JUNE, MARCH);
            when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));

            assertThatThrownBy(() -> issuer.issueForYearByAdministrator(petr, CONNECTED_APPLICATION, JANA, YEAR_2026, TODAY))
                    .isInstanceOf(ReceiptReplacementInBrowserOnly.class)
                    .hasMessageContaining("2027-000001");

            verify(receipts, never()).countReplacementsIssuedAfter(any(), any());
            verify(receipts, never()).nextSerial();
            verify(receipts, never()).save(any());
            assertThat(active.status()).isEqualTo(ReceiptStatus.ACTIVE);
            verifyNoInteractions(events, freezer);
        }

        @Test
        @DisplayName("when a connected application asks for a first receipt or for unchanged data, then the first is issued and audited and the active one comes back")
        void should_issue_first_and_return_active_when_issued_by_connected_application() {
            DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE)), LocaleCode.CS);
            givenDonationsOfJana(jana(), JUNE, MARCH);
            when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
            when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
            when(receipts.nextSerial()).thenReturn(2L);
            givenFreezer();

            assertThat(issuer.issueForYearByAdministrator(petr, CONNECTED_APPLICATION, JANA, YEAR_2026, TODAY)).isSameAs(active);
            DonationReceipt first = issuer.issueForDonationByAdministrator(petr, CONNECTED_APPLICATION, JANA, MARCH.id(), TODAY);

            assertThat(first.number()).isEqualTo(new ReceiptNumber("2027-000002"));
            assertThat(first.supersedes()).isEmpty();
            verify(receipts, times(1)).save(any());
            verify(events).publishEvent(new AdminActionPerformed(petr, "ISSUE_RECEIPT", Optional.of(first.id().value()),
                    "Potvrzení 2027-000002 za dar " + MARCH.id().value() + " vystaveno dárci " + JANA.value(), NOW));
        }
    }

    private DonationReceipt yearlyReceipt(ReceiptFingerprint fingerprint, LocaleCode locale) {
        ReceiptDocument document = ReceiptDocumentFactory.forYear(jana(), YEAR_2026, List.of(MARCH), FOUNDATION, SIGNATORY,
                new ReceiptNumber("2027-000001"), EARLIER, locale, Optional.empty());
        return DonationReceipt.issue(DonationReceiptId.newId(EARLIER_AT), JANA, EARLIER_AT, fingerprint, Receipts.frozen(document), Optional.empty());
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "the name | 王 Wang | Dlouhá 12 | Ústí nad Labem",
            "the street | Jana Nováková | Dlouhá\t12 | Ústí nad Labem",
            "the city | Jana Nováková | Dlouhá 12 | Ústí 😀"
    })
    @DisplayName("Given a donor record whose printed data has a character outside the printable set, when a receipt is issued, then it is refused before a number is taken and nothing is frozen or saved")
    void should_refuse_before_numbering_when_issued_given_an_unprintable_character_in_the_donor_record(String part, String name, String street, String city) {
        DonorRecord record = DonorRecord.registerPerson(JANA, name, new PostalAddress(street, city, "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
        givenDonationsOfJana(record, MARCH);

        assertThatThrownBy(() -> issuer.issueForYear(JANA, YEAR_2026, TODAY))
                .as(part)
                .isInstanceOfSatisfying(ReceiptUnprintable.class, refused -> assertThat(refused.code()).isEqualTo("donations/receipt-unprintable"));

        verify(receipts).lockDonor(JANA);
        verify(receipts, never()).nextSerial();
        verify(receipts, never()).save(any());
        verifyNoInteractions(freezer);
    }

    @Test
    @DisplayName("Given a signatory whose name has a character outside the printable set, when a receipt is issued, then it is refused before a number is taken")
    void should_refuse_before_numbering_when_issued_given_an_unprintable_signatory() {
        DonationReceiptIssuer unprintable = new DonationReceiptIssuer(receipts,
                new ReceiptRequestReader(donations, donorRecords, new FirstReceiptYear(YEAR_2026)), freezer, signatures, signingKeys, FOUNDATION,
                new Signatory("Pavel\u0007Vzorový", "předseda správní rady"), events, Clock.fixed(NOW, ZoneOffset.UTC));
        givenDonationsOfJana(jana(), MARCH);

        assertThatThrownBy(() -> unprintable.issueForYear(JANA, YEAR_2026, TODAY)).isInstanceOf(ReceiptUnprintable.class);

        verify(receipts, never()).nextSerial();
        verifyNoInteractions(freezer);
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

    private static ListAppender<ILoggingEvent> issuerLog() {
        ListAppender<ILoggingEvent> lines = new ListAppender<>();
        lines.start();
        ((Logger) LoggerFactory.getLogger(DonationReceiptIssuer.class)).addAppender(lines);
        return lines;
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
