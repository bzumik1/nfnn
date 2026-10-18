package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
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
            return IssuedReceipt.of(active.get());
        }
        return IssuedReceipt.of(issueNew(request, fingerprint, active));
    }

    private DonationReceipt issueNew(ReceiptRequest request, ReceiptFingerprint fingerprint, Optional<DonationReceipt> replaced) {
        ReceiptNumber number = ReceiptNumber.of(Year.from(request.today()), receipts.nextSerial());
        Instant issuedAt = clock.instant();
        LocaleCode locale = replaced.map(DonationReceipt::locale).orElse(request.record().preferredLocale());
        ReceiptDocument document = request.document(foundation, signatory, number, locale,
                replaced.map(old -> new ReplacedReceipt(old.number(), old.issuedOn())));
        byte[] content = renderer.render(document);
        DonationReceipt issued = request.receipt(DonationReceiptId.newId(issuedAt), number, issuedAt, locale, fingerprint, content,
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
