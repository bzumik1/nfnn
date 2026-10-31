package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPersonNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureArtwork;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureVectorProblem;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.people.FoundationPeople;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

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
    private static final byte[] UTF16_BE_BOM = {(byte) 0xfe, (byte) 0xff};
    private static final byte[] UTF16_LE_BOM = {(byte) 0xff, (byte) 0xfe};

    private static final Logger log = LoggerFactory.getLogger(ReceiptSignatureService.class);

    private final SignatureImageProcessor processor;
    private final SignatureVectorParser vectors;
    private final ReceiptSignatureRepository signatures;
    private final FoundationPeople people;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final Clock clock;

    public ReceiptSignatureService(SignatureImageProcessor processor, SignatureVectorParser vectors, ReceiptSignatureRepository signatures,
                                   FoundationPeople people, ApplicationEventPublisher events, TransactionTemplate transaction, Clock clock) {
        this.processor = processor;
        this.vectors = vectors;
        this.signatures = signatures;
        this.people = people;
        this.events = events;
        this.transaction = transaction;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<CurrentSignature> currentOf(PersonReference person) {
        known(person);
        return signatures.currentOf(person);
    }

    public CurrentSignature upload(UUID adminId, PersonReference person, byte[] upload) {
        known(person);
        SignatureArtwork artwork = isSvg(upload) ? vector(upload) : processor.process(upload);
        Instant now = clock.instant();
        transaction.executeWithoutResult(status -> {
            if (people.findForUpdate(person.value()).isEmpty()) {
                throw new ReceiptPersonNotFound(person);
            }
            signatures.replace(person, artwork, now);
            events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(), details(person, artwork), now));
        });
        log.info("Admin {} uploaded a {}x{} signature image for receipts", adminId, artwork.width(), artwork.height());
        return new CurrentSignature(artwork, now);
    }

    @Transactional
    public void forget(PersonReference person) {
        if (signatures.remove(person)) {
            AfterCommit.run(() -> log.info("Receipt signature of removed person {} deleted", person));
        }
    }

    private void known(PersonReference person) {
        if (people.find(person.value()).isEmpty()) {
            throw new ReceiptPersonNotFound(person);
        }
    }

    private SignatureVector vector(byte[] upload) {
        if (upload.length > SignatureVector.MAX_UPLOAD_BYTES) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.TOO_LARGE);
        }
        return vectors.parse(upload);
    }

    private static boolean isSvg(byte[] upload) {
        if (upload == null) {
            return false;
        }
        if (upload.length >= 2 && (Arrays.equals(upload, 0, 2, UTF16_BE_BOM, 0, 2) || Arrays.equals(upload, 0, 2, UTF16_LE_BOM, 0, 2))) {
            return true;
        }
        int at = upload.length >= UTF8_BOM.length && Arrays.equals(upload, 0, UTF8_BOM.length, UTF8_BOM, 0, UTF8_BOM.length) ? UTF8_BOM.length : 0;
        while (at < upload.length && (upload[at] == ' ' || upload[at] == '\t' || upload[at] == '\r' || upload[at] == '\n')) {
            at++;
        }
        return at < upload.length && upload[at] == '<';
    }

    private static String details(PersonReference person, SignatureArtwork artwork) {
        return switch (artwork) {
            case SignatureImage image -> "Nahrán obrázek podpisu na potvrzení o daru u osoby " + person + ": " + image.width() + " × "
                    + image.height() + " px, SHA-256 " + image.digest();
            case SignatureVector vector -> "Nahrán vektorový podpis (SVG) na potvrzení o daru u osoby " + person + ", SHA-256 " + vector.digest();
        };
    }

    @Transactional
    public void remove(UUID adminId, PersonReference person) {
        known(person);
        if (!signatures.remove(person)) {
            return;
        }
        Instant now = clock.instant();
        events.publishEvent(new AdminActionPerformed(adminId, REMOVE_ACTION, Optional.empty(),
                "Obrázek podpisu na potvrzení o daru u osoby " + person + " odebrán", now));
        AfterCommit.run(() -> log.info("Admin {} removed the signature image for receipts", adminId));
    }
}
