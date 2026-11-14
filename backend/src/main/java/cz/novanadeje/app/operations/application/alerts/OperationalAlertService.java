package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.application.event.OperationalAlertChanged;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlertRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

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
}
