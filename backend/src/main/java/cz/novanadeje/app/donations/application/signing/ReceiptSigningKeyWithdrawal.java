package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyAlreadyWithdrawn;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyNotFound;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
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
public class ReceiptSigningKeyWithdrawal {

    public static final String ACTION = "WITHDRAW_RECEIPT_SIGNING_KEY";
    private static final Logger log = LoggerFactory.getLogger(ReceiptSigningKeyWithdrawal.class);

    private final ReceiptSigningKeyRepository keys;
    private final ReceiptSigningKeys published;
    private final RecordSeals seals;
    private final FreshSecondFactor freshSecondFactor;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReceiptSigningKeyWithdrawal(ReceiptSigningKeyRepository keys, ReceiptSigningKeys published, RecordSeals seals,
                                       FreshSecondFactor freshSecondFactor, ApplicationEventPublisher events, Clock clock) {
        this.keys = keys;
        this.published = published;
        this.seals = seals;
        this.freshSecondFactor = freshSecondFactor;
        this.events = events;
        this.clock = clock;
    }

    public static String details(ReceiptSigningKeyId id) {
        return "Stažen klíč k ověřovacím QR " + id + " (ověřeno druhým faktorem)";
    }

    @Transactional
    public WithdrawnReceiptSigningKey withdraw(UUID adminId, ReceiptSigningKeyId keyId, FreshSecondFactorProof proof) {
        ReceiptSigningKey key = keys.findAll().stream()
                .filter(row -> row.id().equals(keyId) && published.publishable(row))
                .findFirst()
                .orElseThrow(() -> new ReceiptSigningKeyNotFound(keyId));
        if (key.isWithdrawn()) {
            throw new ReceiptSigningKeyAlreadyWithdrawn(keyId);
        }
        freshSecondFactor.require(adminId, proof);
        Instant now = clock.instant();
        boolean current = published.isCurrent(keyId);
        keys.save(key.withdrawn(content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
        events.publishEvent(new AdminActionPerformed(adminId, ACTION, Optional.empty(), details(keyId), now));
        events.publishEvent(new ReceiptSigningKeyWithdrawn(adminId, keyId.value(), current, now));
        log.warn("Admin {} withdrew the receipt signing key {}", adminId, keyId);
        return new WithdrawnReceiptSigningKey(keyId, current);
    }
}
