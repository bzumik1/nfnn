package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class MailAlertRecorder {

    private final OperationalAlertService alerts;

    public MailAlertRecorder(OperationalAlertService alerts) {
        this.alerts = alerts;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean open() {
        return alerts.open(MonitoredArea.MAIL);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(boolean opened, Instant at) {
        alerts.record(MonitoredArea.MAIL, opened, at);
    }
}
