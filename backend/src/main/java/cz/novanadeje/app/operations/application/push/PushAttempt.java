package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;

import java.util.List;

public record PushAttempt(PushDeliveryReport report, List<PushSubscriptionId> failed) {

    public static final PushAttempt NONE = new PushAttempt(PushDeliveryReport.NONE, List.of());

    public PushAttempt {
        failed = List.copyOf(failed);
    }
}
