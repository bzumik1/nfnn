package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;

import java.util.List;

public record PushView(String publicKey, List<PushSubscriptionView> subscriptions, List<OperationalAlert> openAlerts) {
}
