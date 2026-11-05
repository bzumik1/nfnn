package cz.novanadeje.app.operations.application.push;

import java.util.List;

public record PushView(String publicKey, List<PushSubscriptionView> subscriptions) {
}
