package cz.novanadeje.app.operations.domain.push;

public interface PushRecipient {

    PushSubscriptionId id();

    PushEndpoint endpoint();

    PushClientKeys keys();
}
