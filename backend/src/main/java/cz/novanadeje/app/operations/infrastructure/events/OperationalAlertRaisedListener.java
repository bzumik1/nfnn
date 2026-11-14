package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.shared.application.event.OperationalAlertRaised;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class OperationalAlertRaisedListener {

    private final OperationalAlertService alerts;

    OperationalAlertRaisedListener(OperationalAlertService alerts) {
        this.alerts = alerts;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    void on(OperationalAlertRaised raised) {
        alerts.record(areaOf(raised.area()), raised.change() == OperationalAlertRaised.Change.OPENED, raised.at());
    }

    private static MonitoredArea areaOf(OperationalAlertRaised.Area area) {
        return switch (area) {
            case BANK_IMPORT -> MonitoredArea.BANK_IMPORT;
            case BACKUPS -> MonitoredArea.BACKUPS;
            case MAIL -> MonitoredArea.MAIL;
        };
    }
}
