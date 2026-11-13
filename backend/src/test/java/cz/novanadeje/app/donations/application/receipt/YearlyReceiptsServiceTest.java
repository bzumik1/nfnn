package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordErased;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryMissing;
import cz.novanadeje.app.donations.domain.receipt.YearNotYetCompleted;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static cz.novanadeje.app.shared.application.administration.AdministrationChannel.BROWSER;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.ACME;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.JANA;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.NOW;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.TODAY;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.YEAR_2026;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.acme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromAcme;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.receivedFromJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.refundedToJana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyReceiptOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class YearlyReceiptsServiceTest {

    private static final UUID PETR = UUID.fromString("0192f0f1-0000-7000-8000-00000000beef");

    private final DonationReceiptIssuer issuer = mock(DonationReceiptIssuer.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final TransactionTemplate transaction = runningEveryCallback();
    private final YearlyReceiptsService service = new YearlyReceiptsService(issuer, receipts, donations, donorRecords, new FirstReceiptYear(YEAR_2026),
            events, transaction, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given one donor to issue and one the issuer refuses as erased, when the yearly receipts are issued, then the first is issued, the second skipped with the refusal's code, and one audit row counts them")
    void should_issue_and_skip_with_code_and_audit_counts_when_issued_given_one_refused_donor() {
        DonationReceipt issued = yearlyReceiptOf(JANA, YEAR_2026);
        when(issuer.issueForYearInBulk(PETR, BROWSER, JANA, YEAR_2026, TODAY)).thenReturn(new AdministratorIssue(issued, Optional.empty()));
        when(issuer.issueForYearInBulk(PETR, BROWSER, ACME, YEAR_2026, TODAY)).thenThrow(new DonorRecordErased(ACME));

        YearlyReceiptsRun run = service.issue(PETR, BROWSER, YEAR_2026, List.of(JANA, ACME));

        assertThat(run.results()).containsExactly(
                new YearlyReceiptResult(JANA, YearlyReceiptOutcome.ISSUED, Optional.of(issued), Optional.empty(), Optional.empty()),
                YearlyReceiptResult.skipped(ACME, DonorRecordErased.CODE));
        verify(events).publishEvent(new AdminActionPerformed(PETR, "ISSUE_RECEIPTS", Optional.empty(),
                "Hromadně vystavena roční potvrzení za rok 2026: nová 1, nahrazená 0, beze změny 0, přeskočená 1", NOW));
    }

    @Test
    @DisplayName("Given a donor whose active receipt the issuer saw under the lock and returns again, when the yearly receipts are issued, then it is unchanged and nothing is audited")
    void should_report_unchanged_and_audit_nothing_when_issued_given_active_receipt_returned() {
        DonationReceipt active = yearlyReceiptOf(JANA, YEAR_2026);
        when(issuer.issueForYearInBulk(PETR, BROWSER, JANA, YEAR_2026, TODAY)).thenReturn(new AdministratorIssue(active, Optional.of(active)));

        YearlyReceiptsRun run = service.issue(PETR, BROWSER, YEAR_2026, List.of(JANA));

        assertThat(run.results()).extracting(YearlyReceiptResult::outcome).containsExactly(YearlyReceiptOutcome.UNCHANGED);
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a donor whose active receipt the issuer replaced under the lock, when the yearly receipts are issued, then it is replaced naming that receipt")
    void should_report_replaced_with_number_seen_under_lock_when_issued_given_active_receipt_replaced() {
        DonationReceipt active = yearlyReceiptOf(JANA, YEAR_2026);
        DonationReceipt replacement = yearlyReceiptOf(JANA, YEAR_2026);
        when(issuer.issueForYearInBulk(PETR, BROWSER, JANA, YEAR_2026, TODAY)).thenReturn(new AdministratorIssue(replacement, Optional.of(active)));

        YearlyReceiptsRun run = service.issue(PETR, BROWSER, YEAR_2026, List.of(JANA));

        assertThat(run.results()).containsExactly(
                new YearlyReceiptResult(JANA, YearlyReceiptOutcome.REPLACED, Optional.of(replacement), Optional.empty(), Optional.of(active.number())));
    }

    @Test
    @DisplayName("Given a run that issued one receipt before the signing key was withdrawn, when the yearly receipts are issued, then the run is refused and its one audit row counts what it issued")
    void should_audit_what_was_issued_and_refuse_when_issued_given_signing_paused_after_first_donor() {
        DonationReceipt issued = yearlyReceiptOf(JANA, YEAR_2026);
        when(issuer.issueForYearInBulk(PETR, BROWSER, JANA, YEAR_2026, TODAY)).thenReturn(new AdministratorIssue(issued, Optional.empty()));
        when(issuer.issueForYearInBulk(PETR, BROWSER, ACME, YEAR_2026, TODAY))
                .thenThrow(new ReceiptSigningPaused(new ReceiptSigningKeyId("21fe31df")));

        assertThatThrownBy(() -> service.issue(PETR, BROWSER, YEAR_2026, List.of(JANA, ACME))).isInstanceOf(ReceiptSigningPaused.class);

        verify(events).publishEvent(new AdminActionPerformed(PETR, "ISSUE_RECEIPTS", Optional.empty(),
                "Hromadně vystavena roční potvrzení za rok 2026: nová 1, nahrazená 0, beze změny 0, přeskočená 0", NOW));
    }

    @Test
    @DisplayName("Given a withdrawn signing key, when the yearly receipts are issued, then the whole run is refused as a single issue would be and nothing is audited")
    void should_refuse_whole_run_when_issued_given_signing_paused() {
        when(issuer.issueForYearInBulk(PETR, BROWSER, JANA, YEAR_2026, TODAY))
                .thenThrow(new ReceiptSigningPaused(new ReceiptSigningKeyId("21fe31df")));

        assertThatThrownBy(() -> service.issue(PETR, BROWSER, YEAR_2026, List.of(JANA, ACME))).isInstanceOf(ReceiptSigningPaused.class);
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given nobody chosen to sign the receipts, when the yearly receipts are issued, then the whole run is refused as a single issue would be and nothing is audited")
    void should_refuse_whole_run_when_issued_given_signatory_missing() {
        when(issuer.issueForYearInBulk(PETR, BROWSER, JANA, YEAR_2026, TODAY)).thenThrow(new ReceiptSignatoryMissing());

        assertThatThrownBy(() -> service.issue(PETR, BROWSER, YEAR_2026, List.of(JANA, ACME))).isInstanceOf(ReceiptSignatoryMissing.class);
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given the running year, when its yearly receipts are issued or listed, then both are refused before the issuer is asked")
    void should_refuse_running_year_when_issued_or_listed() {
        Year running = Year.of(2027);

        assertThatThrownBy(() -> service.issue(PETR, BROWSER, running, List.of(JANA))).isInstanceOf(YearNotYetCompleted.class);
        assertThatThrownBy(() -> service.candidates(running)).isInstanceOf(YearNotYetCompleted.class);
        verifyNoInteractions(issuer, donations);
    }

    @Test
    @DisplayName("Given received gifts of two donors in the last completed year, a refund and an erased donor, when the candidates are listed without a year, then each live donor comes with the count and sum of received gifts and the active receipt, and the erased one is counted")
    void should_list_live_donors_with_gifts_and_receipt_and_count_erased_when_listed_given_last_completed_year() {
        DonorRecord erased = acme();
        erased.erase(NOW);
        DonationReceipt janasReceipt = yearlyReceiptOf(JANA, YEAR_2026);
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))).thenReturn(List.of(
                receivedFromJana(LocalDate.of(2026, 3, 1), 100000), receivedFromJana(LocalDate.of(2026, 5, 1), 25000),
                refundedToJana(LocalDate.of(2026, 6, 1), 5000), receivedFromAcme(LocalDate.of(2026, 7, 1), 70000)));
        when(receipts.findActiveForYearOfEveryDonor(YEAR_2026)).thenReturn(List.of(janasReceipt));
        when(donorRecords.findByIds(any())).thenReturn(List.of(erased, jana()));

        YearlyReceiptCandidates candidates = service.candidatesOfLastCompletedYear();

        assertThat(candidates.year()).isEqualTo(YEAR_2026);
        assertThat(candidates.years()).isEqualTo(new ReceiptYears(YEAR_2026, YEAR_2026));
        assertThat(candidates.donors()).containsExactly(
                new YearlyReceiptCandidate(JANA, jana().name(), jana().type(), 2, 125000, Optional.of(janasReceipt)));
        assertThat(candidates.erasedDonors()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given the records come back in another order than the gifts, when the candidates of a year are listed, then the donors come in the order of their first gift")
    void should_list_donors_in_order_of_first_gift_when_listed_given_records_in_other_order() {
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))).thenReturn(List.of(
                receivedFromAcme(LocalDate.of(2026, 2, 1), 70000), receivedFromJana(LocalDate.of(2026, 3, 1), 100000)));
        when(receipts.findActiveForYearOfEveryDonor(YEAR_2026)).thenReturn(List.of());
        when(donorRecords.findByIds(any())).thenReturn(List.of(jana(), acme()));

        assertThat(service.candidates(YEAR_2026).donors()).extracting(YearlyReceiptCandidate::donor).containsExactly(ACME, JANA);
    }

    @Test
    @DisplayName("Given the gifts come back out of date order, when the candidates of a year are listed, then the donor of the earliest gift comes first")
    void should_list_donor_of_earliest_gift_first_when_listed_given_gifts_out_of_date_order() {
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))).thenReturn(List.of(
                receivedFromJana(LocalDate.of(2026, 3, 1), 100000), receivedFromAcme(LocalDate.of(2026, 2, 1), 70000)));
        when(receipts.findActiveForYearOfEveryDonor(YEAR_2026)).thenReturn(List.of());
        when(donorRecords.findByIds(any())).thenReturn(List.of(jana(), acme()));

        assertThat(service.candidates(YEAR_2026).donors()).extracting(YearlyReceiptCandidate::donor).containsExactly(ACME, JANA);
    }

    @SuppressWarnings("unchecked")
    private static TransactionTemplate runningEveryCallback() {
        TransactionTemplate template = mock(TransactionTemplate.class);
        when(template.execute(any())).thenAnswer(invocation -> invocation.<TransactionCallback<Object>>getArgument(0).doInTransaction(null));
        doAnswer(invocation -> {
            invocation.<Consumer<Object>>getArgument(0).accept(null);
            return null;
        }).when(template).executeWithoutResult(any());
        return template;
    }
}
