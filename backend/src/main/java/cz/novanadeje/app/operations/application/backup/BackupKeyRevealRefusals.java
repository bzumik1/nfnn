package cz.novanadeje.app.operations.application.backup;

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
public class BackupKeyRevealRefusals {

    static final String REFUSED_ACTION = "VIEW_BACKUP_KEY_REFUSED";
    static final int REFUSALS_BEFORE_PAUSE = 5;
    static final Duration PAUSE_WINDOW = Duration.ofMinutes(15);

    private static final Logger log = LoggerFactory.getLogger(BackupKeyRevealRefusals.class);

    private final AdminActionTrail trail;
    private final ApplicationEventPublisher events;

    public BackupKeyRevealRefusals(AdminActionTrail trail, ApplicationEventPublisher events) {
        this.trail = trail;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public boolean paused(UUID adminId, Instant now) {
        return trail.countPerformedSince(adminId, REFUSED_ACTION, now.minus(PAUSE_WINDOW)) >= REFUSALS_BEFORE_PAUSE;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID adminId, Instant at) {
        events.publishEvent(new AdminActionPerformed(adminId, REFUSED_ACTION, Optional.empty(),
                "Klíč k zálohám se nezobrazil: druhý faktor nesouhlasil", at));
        log.warn("Admin {} was refused the backup key: the second factor did not match", adminId);
    }
}
