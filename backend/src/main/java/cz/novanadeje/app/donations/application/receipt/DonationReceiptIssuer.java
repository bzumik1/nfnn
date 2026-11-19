package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.CurrentKeyForIssuing;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.NewReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssueFacts;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssuePolicy;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptReplacementCaps;
import cz.novanadeje.app.donations.domain.receipt.ReceiptUnprintable;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.YearlyReplacements;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyUnpublished;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.transaction.AfterCommitWork;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class DonationReceiptIssuer {

    private static final Logger log = LoggerFactory.getLogger(DonationReceiptIssuer.class);
    private static final long SERIAL_WORTH_A_WARNING = (ReceiptNumber.LAST_SERIAL + 1) / 10 * 9;
    static final String ISSUE_ACTION = "ISSUE_RECEIPT";

    private final DonationReceiptRepository receipts;
    private final ReceiptRequestReader requests;
    private final ReceiptFreezer freezer;
    private final IssuingSignatory signatories;
    private final ReceiptSigningKeys signingKeys;
    private final FoundationIdentity foundation;
    private final ApplicationEventPublisher events;
    private final AfterCommitWork afterCommit;
    private final Clock clock;

    public DonationReceiptIssuer(DonationReceiptRepository receipts, ReceiptRequestReader requests, ReceiptFreezer freezer,
                                 IssuingSignatory signatories, ReceiptSigningKeys signingKeys, FoundationIdentity foundation,
                                 ApplicationEventPublisher events, AfterCommitWork afterCommit, Clock clock) {
        this.receipts = receipts;
        this.requests = requests;
        this.freezer = freezer;
        this.signatories = signatories;
        this.signingKeys = signingKeys;
        this.foundation = foundation;
        this.events = events;
        this.afterCommit = afterCommit;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForDonation(DonorReference donor, DonationId donation, LocalDate today) {
        refuseUnlessOwnKeyIsPublished(donor);
        receipts.lockDonor(donor);
        requests.refuseErasedRecord(donor);
        return issue(requests.forDonation(donor, donation, today));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForYear(DonorReference donor, Year year, LocalDate today) {
        refuseUnlessOwnKeyIsPublished(donor);
        receipts.lockDonor(donor);
        requests.refuseErasedRecord(donor);
        return issue(requests.forYear(donor, year, today));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForDonationByAdministrator(UUID adminId, AdministrationChannel channel, DonorReference donor, DonationId donation,
                                                          LocalDate today) {
        refuseUnlessOwnKeyIsPublished(donor);
        receipts.lockDonor(donor);
        requests.requireLiveRecord(donor);
        return issueByAdministrator(adminId, channel, requests.forDonation(donor, donation, today)).receipt();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForYearByAdministrator(UUID adminId, AdministrationChannel channel, DonorReference donor, Year year, LocalDate today) {
        return issueForYearOf(adminId, channel, donor, year, today).receipt();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public AdministratorIssue issueForYearInBulk(UUID adminId, AdministrationChannel channel, DonorReference donor, Year year, LocalDate today) {
        return issueForYearOf(adminId, channel, donor, year, today);
    }

    private AdministratorIssue issueForYearOf(UUID adminId, AdministrationChannel channel, DonorReference donor, Year year, LocalDate today) {
        refuseUnlessOwnKeyIsPublished(donor);
        receipts.lockDonor(donor);
        requests.requireLiveRecord(donor);
        return issueByAdministrator(adminId, channel, requests.forYear(donor, year, today));
    }

    private void refuseUnlessOwnKeyIsPublished(DonorReference donor) {
        CurrentKeyForIssuing key = signingKeys.currentKeyHeldForIssuing();
        switch (key.state()) {
            case PUBLISHED -> {
            }
            case WITHDRAWN -> {
                log.warn("No receipt is issued to donor {}: the receipt signing key {} of this server is withdrawn and no new seed has replaced it", donor,
                        key.id());
                throw new ReceiptSigningPaused();
            }
            case UNPUBLISHED -> throw new ReceiptSigningKeyUnpublished();
        }
    }

    private AdministratorIssue issueByAdministrator(UUID adminId, AdministrationChannel channel, ReceiptRequest request) {
        ReceiptIssueFacts facts = factsOf(request);
        Optional<DonationReceipt> again = ReceiptIssuePolicy.activeToReturnAgain(facts);
        if (again.isPresent()) {
            return new AdministratorIssue(returnedAgain(again.get(), request), facts.active());
        }
        NewReceipt newReceipt = newReceiptFor(facts, request, channel.isConnectedApplication());
        AdministratorIssue issue = new AdministratorIssue(issueNew(request, facts.requested(), newReceipt), facts.active());
        if (issue.tookNewNumber()) {
            events.publishEvent(new AdminActionPerformed(adminId, ISSUE_ACTION, Optional.of(issue.receipt().id().value()), auditDetails(issue.receipt()),
                    auditFacts(issue.receipt()), issue.receipt().issuedAt()));
        }
        return issue;
    }

    private static AdminActionPerformed.Facts auditFacts(DonationReceipt receipt) {
        Map<String, String> values = new HashMap<>();
        values.put("number", receipt.number().toString());
        values.put("donor", receipt.donor().toString());
        receipt.year().ifPresent(year -> values.put("year", year.toString()));
        Optional<ReplacedReceipt> replaced = receipt.frozen().document().replaces();
        replaced.ifPresent(old -> values.put("replaced", old.number().toString()));
        String variant = receipt.year().isPresent()
                ? replaced.isPresent() ? ".yearlyReplacing" : ".yearly"
                : replaced.isPresent() ? ".replacing" : "";
        return AdminActionPerformed.Facts.of(ISSUE_ACTION + variant, values);
    }

    private static String auditDetails(DonationReceipt receipt) {
        String subject = receipt.year().map(year -> "za rok " + year)
                .orElseGet(() -> "za dar " + receipt.donation().map(donation -> donation.value().toString()).orElseThrow());
        return "Potvrzení " + receipt.number() + " " + subject + " vystaveno dárci " + receipt.donor()
                + receipt.frozen().document().replaces().map(old -> "; nahrazuje potvrzení " + old.number()).orElse("");
    }

    private DonationReceipt issue(ReceiptRequest request) {
        ReceiptIssueFacts facts = factsOf(request);
        Optional<DonationReceipt> again = ReceiptIssuePolicy.activeToReturnAgain(facts);
        if (again.isPresent()) {
            return returnedAgain(again.get(), request);
        }
        return issueNew(request, facts.requested(), newReceiptFor(facts, request, false));
    }

    private ReceiptIssueFacts factsOf(ReceiptRequest request) {
        return switch (request) {
            case ReceiptRequest.ForDonation single -> {
                Donation donation = single.donation();
                Optional<DonationReceipt> yearlyOfItsYear = receipts.findActiveForYear(single.donor(), donation.receivedYear());
                yield new ReceiptIssueFacts.ForGift(donation.id(), yearlyOfItsYear, single.fingerprint(), receipts.findActiveForDonation(donation.id()));
            }
            case ReceiptRequest.ForYear yearly -> new ReceiptIssueFacts.ForYear(yearly.fingerprint(), receipts.findActiveForYear(yearly.donor(), yearly.year()));
        };
    }

    private NewReceipt newReceiptFor(ReceiptIssueFacts facts, ReceiptRequest request, boolean byConnectedApplication) {
        return switch (facts) {
            case ReceiptIssueFacts.ForGift single -> ReceiptIssuePolicy.newReceipt(single, byConnectedApplication);
            case ReceiptIssueFacts.ForYear yearly -> ReceiptIssuePolicy.newReceipt(yearly, yearlyReplacements((ReceiptRequest.ForYear) request),
                    byConnectedApplication);
        };
    }

    private YearlyReplacements yearlyReplacements(ReceiptRequest.ForYear request) {
        List<DonationReceipt> singles = receipts.findActiveSinglesFor(request.donations().stream().map(Donation::id).toList());
        return new YearlyReplacements(singles, receipts.findLatestOutdatedForYear(request.donor(), request.year()));
    }

    private static DonationReceipt returnedAgain(DonationReceipt active, ReceiptRequest request) {
        log.debug("Returning issued receipt {} again for donor {}", active.number(), request.donor());
        return active;
    }

    private DonationReceipt issueNew(ReceiptRequest request, ReceiptFingerprint fingerprint, NewReceipt newReceipt) {
        Optional<DonationReceipt> replaced = newReceipt.replaces();
        Instant issuedAt = clock.instant();
        SignatoryAtIssue signatory = signatories.resolve(issuedAt);
        ReceiptUnprintable.refuseUnlessPrintable(request.record(), foundation, signatory.signatory());
        if (replaced.isPresent()) {
            refuseBeyondReplacementCaps(request.donor(), issuedAt);
        }
        LocaleCode locale = replaced.map(DonationReceipt::locale).orElse(request.record().preferredLocale());
        Optional<ReplacedReceipt> replaces = replaced.map(old -> new ReplacedReceipt(old.number(), old.issuedOn()));
        Year issuedIn = Year.from(request.today());
        freezer.refuseUnlessItFits(request.document(foundation, signatory.signatory(), ReceiptNumber.of(issuedIn, ReceiptNumber.LAST_SERIAL), locale,
                replaces));
        long serial = receipts.nextSerial();
        ReceiptNumber number = ReceiptNumber.of(issuedIn, serial);
        if (serial >= SERIAL_WORTH_A_WARNING) {
            log.warn("Receipt serial {} has passed 90 % of the numbering, which ends at {}", serial, ReceiptNumber.LAST_SERIAL);
        }
        ReceiptDocument document = request.document(foundation, signatory.signatory(), number, locale, replaces);
        FrozenReceipt frozen = freezer.freeze(document, signatory.signatureImage(), signatory.portraitImage());
        DonationReceipt issued = DonationReceipt.issue(DonationReceiptId.newId(issuedAt), request.donor(), issuedAt, fingerprint, frozen,
                replaced.map(DonationReceipt::id));
        newReceipt.toSupersede().forEach(old -> {
            old.markSuperseded(issuedAt);
            receipts.save(old);
        });
        receipts.save(issued);
        String replacing = replaced.map(old -> " replacing " + old.number()).orElse("");
        afterCommit.run(() -> log.info("Issued receipt {} ({}) for donor {}{}", number, issued.kind(), request.donor(), replacing));
        return issued;
    }

    private void refuseBeyondReplacementCaps(DonorReference donor, Instant issuedAt) {
        ReceiptReplacementCaps.refuseBeyondDay(donor, receipts.countReplacementsIssuedAfter(donor, ReceiptReplacementCaps.dayCountedSince(issuedAt)));
        ReceiptReplacementCaps.refuseBeyondYear(donor, receipts.countReplacementsIssuedSince(donor, ReceiptCalendar.yearStart(issuedAt)));
    }
}
