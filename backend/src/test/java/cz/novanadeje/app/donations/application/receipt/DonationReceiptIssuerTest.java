package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationNotFound;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptContent;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.time.Clock;
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
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SNAPSHOT;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SNAPSHOT_CONTENT;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DonationReceiptIssuerTest {

    private static final byte[] RENDERED = {'%', 'P', 'D', 'F', '1'};
    private static final byte[] STORED = {'%', 'P', 'D', 'F', '0'};
    private static final Donation MARCH = receivedFromJana(LocalDate.of(2026, 3, 15), 50000);
    private static final Donation JUNE = receivedFromJana(LocalDate.of(2026, 6, 1), 125050);
    private static final LocalDate EARLIER = LocalDate.of(2027, 1, 10);

    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationReceiptRenderer renderer = mock(DonationReceiptRenderer.class);
    private final DonationReceiptIssuer issuer = new DonationReceiptIssuer(receipts,
            new ReceiptRequestReader(donations, donorRecords, new FirstReceiptYear(YEAR_2026)), renderer, FOUNDATION, SIGNATORY,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given no receipt yet, when a single receipt is issued, then the donor is locked first, then the donation and the donor record are read, a new number is taken and the rendered PDF is stored")
    void should_issue_new_receipt_from_data_read_after_lock_when_issued_given_no_receipt() {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenRenderer();

        IssuedReceipt issued = issuer.issueForDonation(JANA, MARCH.id(), TODAY);

        InOrder order = inOrder(receipts, donations, donorRecords, renderer);
        order.verify(receipts).lockDonor(JANA);
        order.verify(donations).findByIdForDonor(MARCH.id(), JANA);
        order.verify(donorRecords).findById(JANA);
        order.verify(receipts).findActiveForDonation(MARCH.id());
        order.verify(receipts).nextSerial();
        order.verify(renderer).freeze(any());
        order.verify(renderer).render(SNAPSHOT, new ReceiptNumber("2027-000001"), NOW);
        DonationReceipt saved = savedReceipt();
        assertThat(saved.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(saved.donor()).isEqualTo(JANA);
        assertThat(saved.donation()).contains(MARCH.id());
        assertThat(saved.number()).isEqualTo(new ReceiptNumber("2027-000001"));
        assertThat(saved.issuedOn()).isEqualTo(TODAY);
        assertThat(saved.issuedAt()).isEqualTo(NOW);
        assertThat(saved.locale()).isEqualTo(LocaleCode.CS);
        assertThat(saved.fingerprint()).isEqualTo(ReceiptDocumentFactory.fingerprintForDonation(jana(), MARCH));
        assertThat(saved.content()).isEqualTo(new ReceiptContent(SNAPSHOT, ContentDigest.of(RENDERED)));
        assertThat(saved.supersedes()).isEmpty();
        assertThat(renderedDocument().replaces()).isEmpty();
        assertThat(renderedDocument().number()).isEqualTo(new ReceiptNumber("2027-000001"));
        assertThat(issued.content()).isEqualTo(RENDERED);
        assertThat(issued.number()).isEqualTo(new ReceiptNumber("2027-000001"));
        assertThat(issued.kind()).isEqualTo(ReceiptKind.SINGLE);
        assertThat(issued.year()).isEmpty();
        assertThat(issued.locale()).isEqualTo(LocaleCode.CS);
    }

    @Test
    @DisplayName("Given an active receipt certifying the same data, when issued again, then its snapshot is rendered with its own number and issue time and nothing is numbered, frozen or saved")
    void should_render_kept_snapshot_when_issued_given_equal_fingerprint() {
        ReceiptFingerprint same = ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE));
        DonationReceipt active = yearlyReceipt(same, LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(renderer.render(SNAPSHOT, active.number(), active.issuedAt())).thenReturn(STORED);

        IssuedReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        assertThat(issued.content()).isEqualTo(STORED);
        assertThat(issued.number()).isEqualTo(active.number());
        assertThat(issued.kind()).isEqualTo(ReceiptKind.YEARLY);
        assertThat(issued.year()).contains(YEAR_2026);
        verify(receipts).lockDonor(JANA);
        verify(receipts, never()).nextSerial();
        verify(receipts, never()).save(any());
        verify(renderer, never()).freeze(any());
    }

    @Test
    @DisplayName("Given an active receipt certifying other data, when issued, then a replacement with a new number names the old one, which is superseded first")
    void should_replace_receipt_when_issued_given_different_fingerprint() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(2L);
        givenRenderer();

        IssuedReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        ArgumentCaptor<DonationReceipt> saved = ArgumentCaptor.forClass(DonationReceipt.class);
        verify(receipts, times(2)).save(saved.capture());
        DonationReceipt superseded = saved.getAllValues().get(0);
        DonationReceipt replacement = saved.getAllValues().get(1);
        assertThat(superseded.id()).isEqualTo(active.id());
        assertThat(superseded.supersededAt()).contains(NOW);
        assertThat(replacement.number()).isEqualTo(new ReceiptNumber("2027-000002"));
        assertThat(replacement.supersedes()).contains(active.id());
        assertThat(replacement.year()).contains(YEAR_2026);
        assertThat(replacement.isActive()).isTrue();
        assertThat(renderedDocument().replaces()).contains(new ReplacedReceipt(active.number(), EARLIER));
        assertThat(renderedDocument().lines()).hasSize(2);
        assertThat(issued.number()).isEqualTo(new ReceiptNumber("2027-000002"));
        assertThat(issued.content()).isEqualTo(RENDERED);
    }

    @Test
    @DisplayName("Given an English receipt being replaced for a donor who now prefers Czech, when issued, then the replacement stays English")
    void should_keep_locale_of_replaced_receipt_when_issued_given_changed_preference() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.EN);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(3L);
        givenRenderer();

        IssuedReceipt issued = issuer.issueForYear(JANA, YEAR_2026, TODAY);

        assertThat(renderedDocument().locale()).isEqualTo(LocaleCode.EN);
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
        givenRenderer();

        assertThat(issuer.issueForDonation(JANA, MARCH.id(), TODAY).locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a render that fails, when issued, then the failure propagates and nothing is saved or superseded")
    void should_save_nothing_when_issued_given_render_failure() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(4L);
        when(renderer.freeze(any())).thenReturn(SNAPSHOT);
        when(renderer.render(any(), any(), any())).thenThrow(new IllegalStateException("font missing"));

        assertThatThrownBy(() -> issuer.issueForYear(JANA, YEAR_2026, TODAY))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("font missing");
        verify(receipts, never()).save(any());
        assertThat(active.isActive()).isTrue();
    }

    @Test
    @DisplayName("Given the first of January, when a receipt is issued, then its number carries the new year")
    void should_number_with_year_of_issue_when_issued_given_new_year() {
        givenDonationsOfJana(jana(), MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(17L);
        givenRenderer();

        IssuedReceipt issued = issuer.issueForYear(JANA, YEAR_2026, LocalDate.of(2027, 1, 1));

        assertThat(issued.number()).isEqualTo(ReceiptNumber.of(Year.of(2027), 17));
        assertThat(savedReceipt().issuedOn()).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    @Test
    @DisplayName("Given a completed year, when its yearly receipt is issued, then the donor is locked before the year's donations, the donor record and the active receipt are read")
    void should_read_certified_data_after_lock_when_issued_given_yearly_receipt() {
        givenDonationsOfJana(jana(), JUNE, MARCH);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(5L);
        givenRenderer();

        issuer.issueForYear(JANA, YEAR_2026, TODAY);

        InOrder order = inOrder(receipts, donations, donorRecords);
        order.verify(receipts).lockDonor(JANA);
        order.verify(donations).findByDonorNewestFirst(JANA);
        order.verify(donorRecords).findById(JANA);
        order.verify(receipts).findActiveForYear(JANA, YEAR_2026);
        assertThat(savedReceipt().fingerprint()).isEqualTo(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE)));
    }

    @Test
    @DisplayName("Given a donation that is not the caller's or does not exist, when its receipt is issued, then it is not found under the lock and nothing is numbered, rendered or saved")
    void should_not_find_donation_under_lock_when_issued_given_other_donors_or_unknown_id() {
        DonationId foreign = DonationId.newId(NOW);
        when(donations.findByIdForDonor(foreign, JANA)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> issuer.issueForDonation(JANA, foreign, TODAY)).isInstanceOf(DonationNotFound.class);

        InOrder order = inOrder(receipts, donations);
        order.verify(receipts).lockDonor(JANA);
        order.verify(donations).findByIdForDonor(foreign, JANA);
        verify(receipts, never()).nextSerial();
        verify(receipts, never()).save(any());
        verifyNoInteractions(renderer);
    }

    private DonationReceipt yearlyReceipt(ReceiptFingerprint fingerprint, LocaleCode locale) {
        return DonationReceipt.issueForYear(DonationReceiptId.newId(Instant.parse("2027-01-10T08:00:00Z")), JANA, YEAR_2026,
                new ReceiptNumber("2027-000001"), EARLIER, Instant.parse("2027-01-10T08:00:00Z"), locale, fingerprint, SNAPSHOT_CONTENT,
                Optional.empty());
    }

    private void givenDonationsOfJana(DonorRecord record, Donation... newestFirst) {
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(newestFirst));
        for (Donation donation : newestFirst) {
            when(donations.findByIdForDonor(donation.id(), JANA)).thenReturn(Optional.of(donation));
        }
    }

    private void givenRenderer() {
        when(renderer.freeze(any())).thenReturn(SNAPSHOT);
        when(renderer.render(any(), any(), any())).thenReturn(RENDERED);
    }

    private DonationReceipt savedReceipt() {
        ArgumentCaptor<DonationReceipt> saved = ArgumentCaptor.forClass(DonationReceipt.class);
        verify(receipts).save(saved.capture());
        return saved.getValue();
    }

    private ReceiptDocument renderedDocument() {
        ArgumentCaptor<ReceiptDocument> rendered = ArgumentCaptor.forClass(ReceiptDocument.class);
        verify(renderer).freeze(rendered.capture());
        return rendered.getValue();
    }
}
