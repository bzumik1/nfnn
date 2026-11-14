package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.alerts.MailWatch;
import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class MailDeliveryListener {

    private final MailWatch watch;

    MailDeliveryListener(MailWatch watch) {
        this.watch = watch;
    }

    @EventListener
    void on(MailDeliveryFailed failed) {
        watch.failed(failed.at());
    }

    @EventListener
    void on(MailDeliverySucceeded succeeded) {
        watch.succeeded(succeeded.at());
    }
}
