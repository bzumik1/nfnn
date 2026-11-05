package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.NotFound;

public class PushSubscriptionNotFound extends NotFound {

    public static final String CODE = "operations/push-subscription-not-found";

    public PushSubscriptionNotFound() {
        super(CODE, "There is no such push subscription of this administrator");
    }
}
