package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class PushSubscriptionLimitReached extends Conflict {

    public static final String CODE = "operations/push-subscription-limit";

    public PushSubscriptionLimitReached() {
        super(CODE, "An account has at most " + PushSubscription.MAX_PER_ADMINISTRATOR + " devices with push alerts and "
                + DonorPushSubscription.MAX_PER_DONOR + " with push notifications");
    }
}
