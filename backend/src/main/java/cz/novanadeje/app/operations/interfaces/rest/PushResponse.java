package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.push.PushDeliveryReport;
import cz.novanadeje.app.operations.application.push.PushSubscriptionView;
import cz.novanadeje.app.operations.application.push.PushView;
import cz.novanadeje.app.operations.domain.push.PushAlerts;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

record PushResponse(String publicKey, List<Subscription> subscriptions) {

    static PushResponse from(PushView view) {
        return new PushResponse(view.publicKey(), view.subscriptions().stream().map(Subscription::from).toList());
    }

    record Subscription(UUID id, String service, Alerts alerts, Instant createdAt, Instant lastDeliveredAt, int failuresInARow) {

        static Subscription from(PushSubscriptionView view) {
            return new Subscription(view.id(), view.service().name().toLowerCase(Locale.ROOT), Alerts.from(view.alerts()), view.createdAt(),
                    view.lastDeliveredAt().orElse(null), view.failuresInARow());
        }
    }

    record Alerts(boolean bankImport, boolean backups, boolean mail) {

        static Alerts from(PushAlerts alerts) {
            return new Alerts(alerts.bankImport(), alerts.backups(), alerts.mail());
        }
    }

    record TestDelivery(int delivered, int failed, int removed) {

        static TestDelivery from(PushDeliveryReport report) {
            return new TestDelivery(report.delivered(), report.failed(), report.removed());
        }
    }
}
