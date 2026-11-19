package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.shared.application.event.ImportOutageChanged;
import cz.novanadeje.app.shared.infrastructure.transaction.PublishingTransaction;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class ImportOutageListener {

    private final OperationalAlertService alerts;

    ImportOutageListener(OperationalAlertService alerts) {
        this.alerts = alerts;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    void on(ImportOutageChanged changed) {
        PublishingTransaction.require(changed);
        alerts.record(MonitoredArea.BANK_IMPORT, changed.change() == ImportOutageChanged.Change.OPENED, changed.at());
    }
}
