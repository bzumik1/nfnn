package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Component
public class ReceiptSigningKeyWithdrawalRefusals {

    static final String REFUSED_ACTION = "WITHDRAW_RECEIPT_SIGNING_KEY_REFUSED";
    static final int REFUSALS_BEFORE_PAUSE = 5;
    static final Duration PAUSE_WINDOW = Duration.ofMinutes(15);

    private static final Logger log = LoggerFactory.getLogger(ReceiptSigningKeyWithdrawalRefusals.class);

    private final AdminActionTrail trail;
    private final ApplicationEventPublisher events;

    public ReceiptSigningKeyWithdrawalRefusals(AdminActionTrail trail, ApplicationEventPublisher events) {
        this.trail = trail;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public boolean paused(UUID adminId, Instant now) {
        return trail.countPerformedSince(adminId, REFUSED_ACTION, now.minus(PAUSE_WINDOW)) >= REFUSALS_BEFORE_PAUSE;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID adminId, ReceiptSigningKeyId keyId, Instant at) {
        events.publishEvent(new AdminActionPerformed(adminId, REFUSED_ACTION, Optional.empty(),
                "Klíč k ověřovacím QR " + keyId + " se nestáhl: druhý faktor nesouhlasil", at));
        log.warn("Admin {} was refused the withdrawal of the receipt signing key {}: the second factor did not match", adminId, keyId);
    }
}
