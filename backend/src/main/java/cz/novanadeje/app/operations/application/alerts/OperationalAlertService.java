package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlertRepository;
import cz.novanadeje.app.shared.application.event.OperationalAlertRaised;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class OperationalAlertService {

    private final OperationalAlertRepository alerts;
    private final ApplicationEventPublisher events;

    public OperationalAlertService(OperationalAlertRepository alerts, ApplicationEventPublisher events) {
        this.alerts = alerts;
        this.events = events;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void on(OperationalAlertRaised raised) {
        record(areaOf(raised.area()), raised.change() == OperationalAlertRaised.Change.OPENED, raised.at());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(MonitoredArea area, boolean opened, Instant at) {
        alerts.lockChanges();
        OperationalAlert current = alerts.find(area).orElseGet(() -> OperationalAlert.closed(area));
        Optional<OperationalAlert> changed = opened ? current.openedAt(at) : current.resolvedAt(at);
        changed.ifPresent(alert -> {
            alerts.save(alert);
            int openCount = (int) alerts.findAll().stream().filter(other -> other.area() == area ? alert.open() : other.open()).count();
            events.publishEvent(new OperationalAlertChanged(area, opened, alert.changes(), openCount, at));
        });
    }

    @Transactional(readOnly = true)
    public List<OperationalAlert> open() {
        return alerts.findAll().stream().filter(OperationalAlert::open).toList();
    }

    @Transactional(readOnly = true)
    public boolean unchangedSince(MonitoredArea area, long changes) {
        return alerts.find(area).map(OperationalAlert::changes).orElse(0L) == changes;
    }

    @Transactional(readOnly = true)
    public boolean open(MonitoredArea area) {
        return alerts.find(area).map(OperationalAlert::open).orElse(false);
    }

    private static MonitoredArea areaOf(OperationalAlertRaised.Area area) {
        return switch (area) {
            case BANK_IMPORT -> MonitoredArea.BANK_IMPORT;
            case BACKUPS -> MonitoredArea.BACKUPS;
            case MAIL -> MonitoredArea.MAIL;
        };
    }
}
