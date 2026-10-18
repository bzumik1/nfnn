package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptContent;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSnapshot;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.Year;
import java.util.Optional;

@Service
public class DonationReceiptIssuer {

    private static final Logger LOG = LoggerFactory.getLogger(DonationReceiptIssuer.class);

    private final DonationReceiptRepository receipts;
    private final DonationReceiptRenderer renderer;
    private final FoundationIdentity foundation;
    private final Signatory signatory;
    private final Clock clock;

    public DonationReceiptIssuer(DonationReceiptRepository receipts, DonationReceiptRenderer renderer, FoundationIdentity foundation,
                                 Signatory signatory, Clock clock) {
        this.receipts = receipts;
        this.renderer = renderer;
        this.foundation = foundation;
        this.signatory = signatory;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public IssuedReceipt issue(ReceiptRequest request) {
        receipts.lockDonor(request.donor());
        Optional<DonationReceipt> active = activeReceipt(request);
        ReceiptFingerprint fingerprint = request.fingerprint();
        if (active.isPresent() && active.get().certifies(fingerprint)) {
            LOG.debug("Serving stored receipt {} to donor {}", active.get().number(), request.donor());
            return IssuedReceipt.of(active.get(), contentOf(active.get()));
        }
        return issueNew(request, fingerprint, active);
    }

    private byte[] contentOf(DonationReceipt receipt) {
        return switch (receipt.content()) {
            case ReceiptContent.StoredPdf stored -> stored.pdf();
            case ReceiptContent.Snapshot kept -> renderer.render(kept.snapshot(), receipt.number(), receipt.issuedAt());
        };
    }

    private IssuedReceipt issueNew(ReceiptRequest request, ReceiptFingerprint fingerprint, Optional<DonationReceipt> replaced) {
        ReceiptNumber number = ReceiptNumber.of(Year.from(request.today()), receipts.nextSerial());
        Instant issuedAt = clock.instant();
        LocaleCode locale = replaced.map(DonationReceipt::locale).orElse(request.record().preferredLocale());
        ReceiptDocument document = request.document(foundation, signatory, number, locale,
                replaced.map(old -> new ReplacedReceipt(old.number(), old.issuedOn())));
        ReceiptSnapshot snapshot = renderer.freeze(document);
        byte[] pdf = renderer.render(snapshot, number, issuedAt);
        DonationReceipt issued = request.receipt(DonationReceiptId.newId(issuedAt), number, issuedAt, locale, fingerprint,
                new ReceiptContent.Snapshot(snapshot, ContentDigest.of(pdf)), replaced.map(DonationReceipt::id));
        replaced.ifPresent(old -> {
            old.markSuperseded(issuedAt);
            receipts.save(old);
        });
        receipts.save(issued);
        LOG.info("Issued receipt {} ({}) for donor {}{}", number, issued.kind(), request.donor(),
                replaced.map(old -> " replacing " + old.number()).orElse(""));
        return IssuedReceipt.of(issued, pdf);
    }

    private Optional<DonationReceipt> activeReceipt(ReceiptRequest request) {
        return switch (request) {
            case ReceiptRequest.ForDonation single -> receipts.findActiveForDonation(single.donation().id());
            case ReceiptRequest.ForYear yearly -> receipts.findActiveForYear(yearly.donor(), yearly.year());
        };
    }
}
