package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class ReceiptSignatureService {

    static final String CHANGE_ACTION = "CHANGE_RECEIPT_SIGNATURE";
    static final String REMOVE_ACTION = "REMOVE_RECEIPT_SIGNATURE";

    private static final Logger log = LoggerFactory.getLogger(ReceiptSignatureService.class);

    private final SignatureImageProcessor processor;
    private final ReceiptSignatureRepository signatures;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReceiptSignatureService(SignatureImageProcessor processor, ReceiptSignatureRepository signatures, ApplicationEventPublisher events,
                                   Clock clock) {
        this.processor = processor;
        this.signatures = signatures;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<CurrentSignature> current() {
        return signatures.current();
    }

    @Transactional
    public CurrentSignature upload(UUID adminId, byte[] upload) {
        SignatureImage image = processor.process(upload);
        Instant now = clock.instant();
        signatures.replace(image, now);
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "Signature image for receipts uploaded: " + image.width() + "x" + image.height() + " px, SHA-256 " + image.digest(), now));
        log.info("Admin {} uploaded a {}x{} signature image for receipts", adminId, image.width(), image.height());
        return new CurrentSignature(image, now);
    }

    @Transactional
    public void remove(UUID adminId) {
        if (!signatures.remove()) {
            return;
        }
        Instant now = clock.instant();
        events.publishEvent(new AdminActionPerformed(adminId, REMOVE_ACTION, Optional.empty(),
                "Signature image for receipts removed; new receipts carry the line and the name only", now));
        log.info("Admin {} removed the signature image for receipts", adminId);
    }
}
