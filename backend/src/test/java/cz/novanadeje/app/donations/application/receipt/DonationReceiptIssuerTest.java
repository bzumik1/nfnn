package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
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
    private final DonationReceiptRenderer renderer = mock(DonationReceiptRenderer.class);
    private final DonationReceiptIssuer issuer = new DonationReceiptIssuer(receipts, renderer, FOUNDATION, SIGNATORY,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given no receipt yet, when a single receipt is issued, then the donor is locked first, a new number is taken and the rendered PDF is stored")
    void should_issue_new_receipt_after_lock_when_issued_given_no_receipt() {
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenRenderer();

        IssuedReceipt issued = issuer.issue(ReceiptRequest.forDonation(jana(), MARCH, TODAY));

        InOrder order = inOrder(receipts, renderer);
        order.verify(receipts).lockDonor(JANA);
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
        assertThat(saved.content()).isEqualTo(new ReceiptContent.Snapshot(SNAPSHOT, ContentDigest.of(RENDERED)));
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
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(renderer.render(SNAPSHOT, active.number(), active.issuedAt())).thenReturn(STORED);

        IssuedReceipt issued = issuer.issue(ReceiptRequest.forYear(jana(), YEAR_2026, List.of(MARCH, JUNE), TODAY));

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
    @DisplayName("Given an active receipt stored as a PDF before snapshots, when issued again, then exactly that PDF comes back without rendering")
    void should_serve_stored_pdf_when_issued_given_receipt_from_before_snapshots() {
        ReceiptFingerprint same = ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH, JUNE));
        DonationReceipt active = DonationReceipt.reconstitute(DonationReceiptId.newId(Instant.parse("2026-10-10T08:00:00Z")), JANA,
                ReceiptKind.YEARLY, Optional.empty(), Optional.of(YEAR_2026), new ReceiptNumber("2026-000001"), LocalDate.of(2026, 10, 10),
                Instant.parse("2026-10-10T08:00:00Z"), LocaleCode.CS, same, new ReceiptContent.StoredPdf(STORED), Optional.empty(),
                Optional.empty());
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));

        IssuedReceipt issued = issuer.issue(ReceiptRequest.forYear(jana(), YEAR_2026, List.of(MARCH, JUNE), TODAY));

        assertThat(issued.content()).isEqualTo(STORED);
        verifyNoInteractions(renderer);
        verify(receipts, never()).save(any());
    }

    @Test
    @DisplayName("Given an active receipt certifying other data, when issued, then a replacement with a new number names the old one, which is superseded first")
    void should_replace_receipt_when_issued_given_different_fingerprint() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(2L);
        givenRenderer();

        IssuedReceipt issued = issuer.issue(ReceiptRequest.forYear(jana(), YEAR_2026, List.of(JUNE, MARCH), TODAY));

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
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(3L);
        givenRenderer();

        IssuedReceipt issued = issuer.issue(ReceiptRequest.forYear(jana(), YEAR_2026, List.of(MARCH, JUNE), TODAY));

        assertThat(renderedDocument().locale()).isEqualTo(LocaleCode.EN);
        assertThat(issued.locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a donor who prefers English and no receipt yet, when issued, then the receipt is English")
    void should_use_preferred_locale_when_issued_given_first_receipt() {
        DonorRecord english = jana();
        english.changeProfile(english.name(), english.address(), LocaleCode.EN, NOW);
        when(receipts.findActiveForDonation(MARCH.id())).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(1L);
        givenRenderer();

        assertThat(issuer.issue(ReceiptRequest.forDonation(english, MARCH, TODAY)).locale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given a render that fails, when issued, then the failure propagates and nothing is saved or superseded")
    void should_save_nothing_when_issued_given_render_failure() {
        DonationReceipt active = yearlyReceipt(ReceiptDocumentFactory.fingerprintForYear(jana(), YEAR_2026, List.of(MARCH)), LocaleCode.CS);
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.of(active));
        when(receipts.nextSerial()).thenReturn(4L);
        when(renderer.freeze(any())).thenReturn(SNAPSHOT);
        when(renderer.render(any(), any(), any())).thenThrow(new IllegalStateException("font missing"));

        assertThatThrownBy(() -> issuer.issue(ReceiptRequest.forYear(jana(), YEAR_2026, List.of(MARCH, JUNE), TODAY)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("font missing");
        verify(receipts, never()).save(any());
        assertThat(active.isActive()).isTrue();
    }

    @Test
    @DisplayName("Given the first of January, when a receipt is issued, then its number carries the new year")
    void should_number_with_year_of_issue_when_issued_given_new_year() {
        when(receipts.findActiveForYear(JANA, YEAR_2026)).thenReturn(Optional.empty());
        when(receipts.nextSerial()).thenReturn(17L);
        givenRenderer();

        IssuedReceipt issued = issuer.issue(ReceiptRequest.forYear(jana(), YEAR_2026, List.of(MARCH), LocalDate.of(2027, 1, 1)));

        assertThat(issued.number()).isEqualTo(ReceiptNumber.of(Year.of(2027), 17));
        assertThat(savedReceipt().issuedOn()).isEqualTo(LocalDate.of(2027, 1, 1));
    }

    private DonationReceipt yearlyReceipt(ReceiptFingerprint fingerprint, LocaleCode locale) {
        return DonationReceipt.issueForYear(DonationReceiptId.newId(Instant.parse("2027-01-10T08:00:00Z")), JANA, YEAR_2026,
                new ReceiptNumber("2027-000001"), EARLIER, Instant.parse("2027-01-10T08:00:00Z"), locale, fingerprint, SNAPSHOT_CONTENT,
                Optional.empty());
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
