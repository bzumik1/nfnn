package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyAlreadyWithdrawn;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyNotFound;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyWithdrawalPaused;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.domain.error.DomainException;
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
    private final ReceiptSigningKeyWithdrawalRefusals refusals;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReceiptSigningKeyWithdrawal(ReceiptSigningKeyRepository keys, ReceiptSigningKeys published, RecordSeals seals,
                                       FreshSecondFactor freshSecondFactor, ReceiptSigningKeyWithdrawalRefusals refusals,
                                       ApplicationEventPublisher events, Clock clock) {
        this.keys = keys;
        this.published = published;
        this.seals = seals;
        this.freshSecondFactor = freshSecondFactor;
        this.refusals = refusals;
        this.events = events;
        this.clock = clock;
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
        Instant now = clock.instant();
        if (refusals.paused(adminId, now)) {
            log.warn("Admin {} asked to withdraw a receipt signing key while it is paused after refused second factors", adminId);
            throw new ReceiptSigningKeyWithdrawalPaused();
        }
        try {
            freshSecondFactor.require(adminId, proof);
        } catch (DomainException refused) {
            refusals.record(adminId, keyId, now);
            throw refused;
        }
        boolean current = published.isCurrent(keyId);
        keys.save(key.withdrawn(content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
        events.publishEvent(new AdminActionPerformed(adminId, ACTION, Optional.empty(), ReceiptSigningKeyAuditDetails.withdrawn(keyId), now));
        events.publishEvent(new ReceiptSigningKeyWithdrawn(adminId, keyId.value(), current, now));
        log.warn("Admin {} withdrew the receipt signing key {}", adminId, keyId);
        return new WithdrawnReceiptSigningKey(keyId, current);
    }
}
