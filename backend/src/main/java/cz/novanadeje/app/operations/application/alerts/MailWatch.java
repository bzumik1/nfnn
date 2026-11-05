package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;

@Component
public class MailWatch {

    private static final Logger log = LoggerFactory.getLogger(MailWatch.class);

    private final OperationalAlertService alerts;
    private final TransactionTemplate separately;

    public MailWatch(OperationalAlertService alerts, PlatformTransactionManager transactions) {
        this.alerts = alerts;
        this.separately = new TransactionTemplate(transactions);
        this.separately.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @EventListener
    public void on(MailDeliveryFailed failed) {
        record(true, failed.at());
    }

    @EventListener
    public void on(MailDeliverySucceeded succeeded) {
        if (open()) {
            record(false, succeeded.at());
        }
    }

    private boolean open() {
        try {
            return Boolean.TRUE.equals(separately.execute(status -> alerts.open(MonitoredArea.MAIL)));
        } catch (RuntimeException failure) {
            log.warn("The mail alert could not be read: {}", failure.getClass().getSimpleName());
            return false;
        }
    }

    private void record(boolean opened, Instant at) {
        try {
            separately.executeWithoutResult(status -> alerts.record(MonitoredArea.MAIL, opened, at));
        } catch (RuntimeException failure) {
            log.warn("The mail alert could not be recorded: {}", failure.getClass().getSimpleName());
        }
    }
}
