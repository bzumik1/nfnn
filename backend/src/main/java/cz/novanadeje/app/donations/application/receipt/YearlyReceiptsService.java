package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryMissing;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryNeedsRenaming;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryUnprintable;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyUnpublished;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.error.DomainException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class YearlyReceiptsService {

    public static final int MAX_DONORS_PER_RUN = 50;
    static final String ISSUE_ACTION = "ISSUE_RECEIPTS";

    private final DonationReceiptIssuer issuer;
    private final DonationReceiptRepository receipts;
    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;
    private final FirstReceiptYear firstYear;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final Clock clock;

    public YearlyReceiptsService(DonationReceiptIssuer issuer, DonationReceiptRepository receipts, DonationRepository donations,
                                 DonorRecordRepository donorRecords, FirstReceiptYear firstYear, ApplicationEventPublisher events,
                                 TransactionTemplate transaction, Clock clock) {
        this.issuer = issuer;
        this.receipts = receipts;
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.firstYear = firstYear;
        this.events = events;
        this.transaction = transaction;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public YearlyReceiptCandidates candidates(Year year) {
        LocalDate today = FoundationCalendar.today(clock);
        DonationReceiptService.requireCompletedYear(firstYear, year, today);
        return candidatesOf(year, today);
    }

    @Transactional(readOnly = true)
    public YearlyReceiptCandidates candidatesOfLastCompletedYear() {
        return candidates(ReceiptCalendar.lastCompleted(FoundationCalendar.today(clock)));
    }

    public YearlyReceiptsRun issue(UUID adminId, AdministrationChannel channel, Year year, List<DonorReference> donors) {
        LocalDate today = FoundationCalendar.today(clock);
        DonationReceiptService.requireCompletedYear(firstYear, year, today);
        List<YearlyReceiptResult> results = new ArrayList<>();
        try {
            for (DonorReference donor : donors) {
                results.add(issueOne(adminId, channel, donor, year, today));
            }
        } finally {
            audit(adminId, new YearlyReceiptsRun(year, results));
        }
        return new YearlyReceiptsRun(year, results);
    }

    private void audit(UUID adminId, YearlyReceiptsRun run) {
        if (run.tookNewNumbers()) {
            transaction.executeWithoutResult(status -> events.publishEvent(
                    new AdminActionPerformed(adminId, ISSUE_ACTION, Optional.empty(), auditDetails(run), clock.instant())));
        }
    }

    private YearlyReceiptResult issueOne(UUID adminId, AdministrationChannel channel, DonorReference donor, Year year, LocalDate today) {
        AdministratorIssue issue;
        try {
            issue = issuer.issueForYearInBulk(adminId, channel, donor, year, today);
        } catch (ReceiptSigningPaused | ReceiptSigningKeyUnpublished | ReceiptSignatoryMissing | ReceiptSignatoryNeedsRenaming
                 | ReceiptSignatoryUnprintable signingStopped) {
            throw signingStopped;
        } catch (DomainException refused) {
            return YearlyReceiptResult.skipped(donor, refused.code());
        }
        YearlyReceiptOutcome outcome = !issue.tookNewNumber() ? YearlyReceiptOutcome.UNCHANGED
                : issue.replacedActive().isPresent() ? YearlyReceiptOutcome.REPLACED : YearlyReceiptOutcome.ISSUED;
        return new YearlyReceiptResult(donor, outcome, Optional.of(issue.receipt()), Optional.empty(), issue.replacedActive());
    }

    private YearlyReceiptCandidates candidatesOf(Year year, LocalDate today) {
        Map<DonorReference, List<Donation>> gifts = donations.findReceivedOnBetween(year.atDay(1), year.atMonth(12).atEndOfMonth()).stream()
                .filter(Donation::isReceived)
                .collect(Collectors.groupingBy(Donation::donor, LinkedHashMap::new, Collectors.toList()));
        Map<DonorReference, DonationReceipt> active = receipts.findActiveForYearOfEveryDonor(year).stream()
                .collect(Collectors.toMap(DonationReceipt::donor, Function.identity()));
        List<DonorRecord> records = donorRecords.findByIds(gifts.keySet());
        Map<DonorReference, DonorRecord> recordsById = records.stream().collect(Collectors.toMap(DonorRecord::id, Function.identity()));
        List<YearlyReceiptCandidate> candidates = gifts.keySet().stream()
                .map(recordsById::get)
                .filter(record -> record != null && !record.isErased())
                .map(record -> candidate(record, gifts.get(record.id()), Optional.ofNullable(active.get(record.id()))))
                .toList();
        return new YearlyReceiptCandidates(year, new ReceiptYears(ReceiptCalendar.lastCompleted(today), firstYear.year()), candidates,
                (int) records.stream().filter(DonorRecord::isErased).count());
    }

    private static YearlyReceiptCandidate candidate(DonorRecord record, Collection<Donation> gifts, Optional<DonationReceipt> receipt) {
        return new YearlyReceiptCandidate(record.id(), record.name(), record.type(), gifts.size(),
                gifts.stream().mapToLong(gift -> gift.amount().amountMinor()).sum(), receipt);
    }

    private static String auditDetails(YearlyReceiptsRun run) {
        return "Hromadně vystavena roční potvrzení za rok " + run.year() + ": nová " + run.count(YearlyReceiptOutcome.ISSUED) + ", nahrazená "
                + run.count(YearlyReceiptOutcome.REPLACED) + ", beze změny " + run.count(YearlyReceiptOutcome.UNCHANGED) + ", přeskočená "
                + run.count(YearlyReceiptOutcome.SKIPPED);
    }
}
