package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptIssueLimitReached;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;

@Service
public class DonationReceiptIssuer {

    private static final Logger LOG = LoggerFactory.getLogger(DonationReceiptIssuer.class);
    private static final long SERIAL_WORTH_A_WARNING = (ReceiptNumber.LAST_SERIAL + 1) / 10 * 9;
    static final int NEW_RECEIPTS_PER_DONOR_A_DAY = 20;
    private static final Duration ISSUE_LIMIT_WINDOW = Duration.ofHours(24);

    private final DonationReceiptRepository receipts;
    private final ReceiptRequestReader requests;
    private final ReceiptFreezer freezer;
    private final ReceiptSignatureRepository signatures;
    private final FoundationIdentity foundation;
    private final Signatory signatory;
    private final Clock clock;

    public DonationReceiptIssuer(DonationReceiptRepository receipts, ReceiptRequestReader requests, ReceiptFreezer freezer,
                                 ReceiptSignatureRepository signatures, FoundationIdentity foundation, Signatory signatory, Clock clock) {
        this.receipts = receipts;
        this.requests = requests;
        this.freezer = freezer;
        this.signatures = signatures;
        this.foundation = foundation;
        this.signatory = signatory;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForDonation(DonorReference donor, DonationId donation, LocalDate today) {
        receipts.lockDonor(donor);
        return issue(requests.forDonation(donor, donation, today));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public DonationReceipt issueForYear(DonorReference donor, Year year, LocalDate today) {
        receipts.lockDonor(donor);
        return issue(requests.forYear(donor, year, today));
    }

    private DonationReceipt issue(ReceiptRequest request) {
        Optional<DonationReceipt> active = activeReceipt(request);
        ReceiptFingerprint fingerprint = request.fingerprint();
        if (active.isPresent() && active.get().certifies(fingerprint)) {
            LOG.debug("Returning issued receipt {} again for donor {}", active.get().number(), request.donor());
            return active.get();
        }
        return issueNew(request, fingerprint, active);
    }

    private DonationReceipt issueNew(ReceiptRequest request, ReceiptFingerprint fingerprint, Optional<DonationReceipt> replaced) {
        if (receipts.countIssuedAfter(request.donor(), clock.instant().minus(ISSUE_LIMIT_WINDOW)) >= NEW_RECEIPTS_PER_DONOR_A_DAY) {
            throw new ReceiptIssueLimitReached(request.donor(), NEW_RECEIPTS_PER_DONOR_A_DAY);
        }
        long serial = receipts.nextSerial();
        ReceiptNumber number = ReceiptNumber.of(Year.from(request.today()), serial);
        if (serial >= SERIAL_WORTH_A_WARNING) {
            LOG.warn("Receipt serial {} has passed 90 % of the numbering, which ends at {}", serial, ReceiptNumber.LAST_SERIAL);
        }
        Instant issuedAt = clock.instant();
        LocaleCode locale = replaced.map(DonationReceipt::locale).orElse(request.record().preferredLocale());
        ReceiptDocument document = request.document(foundation, signatory, number, locale,
                replaced.map(old -> new ReplacedReceipt(old.number(), old.issuedOn())));
        FrozenReceipt frozen = freezer.freeze(document, signatures.current().map(CurrentSignature::image).map(SignatureImage::digest));
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
