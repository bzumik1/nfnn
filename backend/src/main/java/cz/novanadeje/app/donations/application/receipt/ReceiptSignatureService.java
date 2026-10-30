package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureVectorProblem;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;

@Service
public class ReceiptSignatureService {

    static final String CHANGE_ACTION = "CHANGE_RECEIPT_SIGNATURE";
    static final String REMOVE_ACTION = "REMOVE_RECEIPT_SIGNATURE";

    private static final byte[] UTF8_BOM = {(byte) 0xef, (byte) 0xbb, (byte) 0xbf};

    private static final Logger log = LoggerFactory.getLogger(ReceiptSignatureService.class);

    private final SignatureImageProcessor processor;
    private final SignatureVectorParser vectors;
    private final ReceiptSignatureRepository signatures;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReceiptSignatureService(SignatureImageProcessor processor, SignatureVectorParser vectors, ReceiptSignatureRepository signatures,
                                   ApplicationEventPublisher events, Clock clock) {
        this.processor = processor;
        this.vectors = vectors;
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
        SignatureArtwork artwork = isMarkup(upload) ? vector(upload) : processor.process(upload);
        Instant now = clock.instant();
        signatures.replace(artwork, now);
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(), details(artwork), now));
        log.info("Admin {} uploaded a {}x{} signature image for receipts", adminId, artwork.width(), artwork.height());
        return new CurrentSignature(artwork, now);
    }

    private SignatureVector vector(byte[] upload) {
        if (upload.length > SignatureVector.MAX_UPLOAD_BYTES) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.TOO_LARGE);
        }
        return vectors.parse(upload);
    }

    private static boolean isMarkup(byte[] upload) {
        if (upload == null) {
            return false;
        }
        int at = upload.length >= UTF8_BOM.length && Arrays.equals(upload, 0, UTF8_BOM.length, UTF8_BOM, 0, UTF8_BOM.length) ? UTF8_BOM.length : 0;
        while (at < upload.length && (upload[at] == ' ' || upload[at] == '\t' || upload[at] == '\r' || upload[at] == '\n')) {
            at++;
        }
        return at < upload.length && upload[at] == '<';
    }

    private static String details(SignatureArtwork artwork) {
        return switch (artwork) {
            case SignatureImage image ->
                    "Nahrán obrázek podpisu na potvrzení o daru: " + image.width() + " × " + image.height() + " px, SHA-256 " + image.digest();
            case SignatureVector vector -> "Nahrán vektorový podpis (SVG) na potvrzení o daru, SHA-256 " + vector.digest();
        };
    }

    @Transactional
    public void remove(UUID adminId) {
        if (!signatures.remove()) {
            return;
        }
        Instant now = clock.instant();
        events.publishEvent(new AdminActionPerformed(adminId, REMOVE_ACTION, Optional.empty(),
                "Obrázek podpisu odebrán; nová potvrzení o daru mají jen čáru a jméno", now));
        log.info("Admin {} removed the signature image for receipts", adminId);
    }
}
