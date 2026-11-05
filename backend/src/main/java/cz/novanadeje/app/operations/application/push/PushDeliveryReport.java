package cz.novanadeje.app.operations.application.push;

public record PushDeliveryReport(int delivered, int failed, int removed) {

    public static final PushDeliveryReport NONE = new PushDeliveryReport(0, 0, 0);

    PushDeliveryReport with(PushDeliveryReport other) {
        return new PushDeliveryReport(delivered + other.delivered, failed + other.failed, removed + other.removed);
    }
}
