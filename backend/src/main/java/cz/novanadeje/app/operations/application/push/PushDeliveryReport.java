package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushOutcome;

public record PushDeliveryReport(int delivered, int failed, int removed) {

    public static final PushDeliveryReport NONE = new PushDeliveryReport(0, 0, 0);

    static PushDeliveryReport of(PushOutcome outcome) {
        return switch (outcome) {
            case DELIVERED -> new PushDeliveryReport(1, 0, 0);
            case GONE -> new PushDeliveryReport(0, 0, 1);
            case FAILED -> new PushDeliveryReport(0, 1, 0);
        };
    }

    PushDeliveryReport with(PushDeliveryReport other) {
        return new PushDeliveryReport(delivered + other.delivered, failed + other.failed, removed + other.removed);
    }
}
