package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.application.push.PushAlertDispatcher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class OperationalAlertPushListener {

    private final PushAlertDispatcher dispatcher;

    OperationalAlertPushListener(PushAlertDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(OperationalAlertChanged changed) {
        dispatcher.alertChanged(changed.area(), changed.opened(), changed.changes(), changed.openCount());
    }
}
