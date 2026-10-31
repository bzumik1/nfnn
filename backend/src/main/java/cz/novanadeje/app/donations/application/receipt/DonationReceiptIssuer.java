package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssueLimitReached;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptReplacementInBrowserOnly;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;
import java.util.UUID;

@Service
public class DonationReceiptIssuer {

    private static final Logger LOG = LoggerFactory.getLogger(DonationReceiptIssuer.class);
    private static final long SERIAL_WORTH_A_WARNING = (ReceiptNumber.LAST_SERIAL + 1) / 10 * 9;
    static final int REPLACEMENTS_PER_DONOR_A_DAY = 20;
    private static final Duration ISSUE_LIMIT_WINDOW = Duration.ofHours(24);
    static final String ISSUE_ACTION = "ISSUE_RECEIPT";

    private final DonationReceiptRepository receipts;
    private final ReceiptRequestReader requests;
    private final ReceiptFreezer freezer;
    private final IssuingSignatory signatories;
    private final ReceiptSigningKeys signingKeys;
    private final FoundationIdentity foundation;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonationReceiptIssuer(DonationReceiptRepository receipts, ReceiptRequestReader requests, ReceiptFreezer freezer,
                                 IssuingSignatory signatories, ReceiptSigningKeys signingKeys, FoundationIdentity foundation,
                                 ApplicationEventPublisher events, Clock clock) {
        this.receipts = receipts;
        this.requests = requests;
        this.freezer = freezer;
        this.signatories = signatories;
        this.signingKeys = signingKeys;
        this.foundation = foundation;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForDonation(DonorReference donor, DonationId donation, LocalDate today) {
        refuseWhileOwnKeyIsWithdrawn(donor);
        receipts.lockDonor(donor);
        return issue(requests.forDonation(donor, donation, today));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForYear(DonorReference donor, Year year, LocalDate today) {
        refuseWhileOwnKeyIsWithdrawn(donor);
        receipts.lockDonor(donor);
        return issue(requests.forYear(donor, year, today));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForDonationByAdministrator(UUID adminId, AdministrationChannel channel, DonorReference donor, DonationId donation,
                                                          LocalDate today) {
        refuseWhileOwnKeyIsWithdrawn(donor);
        receipts.lockDonor(donor);
        requests.requireLiveRecord(donor);
        return issueByAdministrator(adminId, channel, requests.forDonation(donor, donation, today));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForYearByAdministrator(UUID adminId, AdministrationChannel channel, DonorReference donor, Year year, LocalDate today) {
        refuseWhileOwnKeyIsWithdrawn(donor);
        receipts.lockDonor(donor);
        requests.requireLiveRecord(donor);
        return issueByAdministrator(adminId, channel, requests.forYear(donor, year, today));
    }

    private void refuseWhileOwnKeyIsWithdrawn(DonorReference donor) {
        signingKeys.withdrawnCurrentKeyHeldForIssuing().ifPresent(key -> {
            LOG.warn("No receipt is issued to donor {}: the receipt signing key {} of this server is withdrawn and no new seed has replaced it", donor, key);
            throw new ReceiptSigningPaused(key);
        });
    }

    private DonationReceipt issueByAdministrator(UUID adminId, AdministrationChannel channel, ReceiptRequest request) {
        Optional<DonationReceipt> active = activeReceipt(request);
        Optional<DonationReceipt> replaced = active.filter(previous -> !previous.certifies(request.fingerprint()));
        if (replaced.isPresent() && !channel.mayReplaceReceipts()) {
            throw new ReceiptReplacementInBrowserOnly(replaced.get().number());
        }
        DonationReceipt receipt = issue(request, active);
        if (active.filter(previous -> previous.id().equals(receipt.id())).isEmpty()) {
            events.publishEvent(new AdminActionPerformed(adminId, ISSUE_ACTION, Optional.of(receipt.id().value()), auditDetails(receipt, active),
                    receipt.issuedAt()));
        }
        return receipt;
    }

    private static String auditDetails(DonationReceipt receipt, Optional<DonationReceipt> replaced) {
        String subject = receipt.year().map(year -> "za rok " + year)
                .orElseGet(() -> "za dar " + receipt.donation().map(donation -> donation.value().toString()).orElseThrow());
        return "Potvrzení " + receipt.number() + " " + subject + " vystaveno dárci " + receipt.donor()
                + replaced.map(old -> "; nahrazuje potvrzení " + old.number()).orElse("");
    }

    private DonationReceipt issue(ReceiptRequest request) {
        return issue(request, activeReceipt(request));
    }

    private DonationReceipt issue(ReceiptRequest request, Optional<DonationReceipt> active) {
        ReceiptFingerprint fingerprint = request.fingerprint();
        if (active.isPresent() && active.get().certifies(fingerprint)) {
            LOG.debug("Returning issued receipt {} again for donor {}", active.get().number(), request.donor());
            return active.get();
        }
        return issueNew(request, fingerprint, active);
    }

    private DonationReceipt issueNew(ReceiptRequest request, ReceiptFingerprint fingerprint, Optional<DonationReceipt> replaced) {
        if (replaced.isPresent() && receipts.countReplacementsIssuedAfter(request.donor(), clock.instant().minus(ISSUE_LIMIT_WINDOW)) >= REPLACEMENTS_PER_DONOR_A_DAY) {
            throw new ReceiptIssueLimitReached(request.donor(), REPLACEMENTS_PER_DONOR_A_DAY);
        }
        Instant issuedAt = clock.instant();
        SignatoryAtIssue signatory = signatories.resolve(issuedAt);
        long serial = receipts.nextSerial();
        ReceiptNumber number = ReceiptNumber.of(Year.from(request.today()), serial);
        if (serial >= SERIAL_WORTH_A_WARNING) {
            LOG.warn("Receipt serial {} has passed 90 % of the numbering, which ends at {}", serial, ReceiptNumber.LAST_SERIAL);
        }
        LocaleCode locale = replaced.map(DonationReceipt::locale).orElse(request.record().preferredLocale());
        ReceiptDocument document = request.document(foundation, signatory.signatory(), number, locale,
                replaced.map(old -> new ReplacedReceipt(old.number(), old.issuedOn())));
        FrozenReceipt frozen = freezer.freeze(document, signatory.signatureImage(), signatory.portraitImage());
        DonationReceipt issued = DonationReceipt.issue(DonationReceiptId.newId(issuedAt), request.donor(), issuedAt, fingerprint, frozen,
                replaced.map(DonationReceipt::id));
        replaced.ifPresent(old -> {
            old.markSuperseded(issuedAt);
            receipts.save(old);
        });
        receipts.save(issued);
        LOG.info("Issued receipt {} ({}) for donor {}{}", number, issued.kind(), request.donor(),
                replaced.map(old -> " replacing " + old.number()).orElse(""));
        return issued;
    }

    private Optional<DonationReceipt> activeReceipt(ReceiptRequest request) {
        return switch (request) {
            case ReceiptRequest.ForDonation single -> receipts.findActiveForDonation(single.donation().id());
            case ReceiptRequest.ForYear yearly -> receipts.findActiveForYear(yearly.donor(), yearly.year());
        };
    }
}
