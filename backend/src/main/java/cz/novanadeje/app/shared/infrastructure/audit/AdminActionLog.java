package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class AdminActionLog {

    private static final Logger log = LoggerFactory.getLogger(AdminActionLog.class);

    private final AdminActionJpaRepository actions;

    AdminActionLog(AdminActionJpaRepository actions) {
        this.actions = actions;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void record(AdminActionPerformed event) {
        actions.save(AdminActionJpaEntity.of(event));
        log.info("Admin {} performed {} on {}", event.adminId(), event.action(), event.subjectId().map(Object::toString).orElse("nothing"));
    }
}
