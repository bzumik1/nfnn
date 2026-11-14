package cz.novanadeje.app.operations.domain.push;

public sealed interface PushRecipient permits PushSubscription, DonorPushSubscription {

    PushSubscriptionId id();

    PushEndpoint endpoint();

    PushClientKeys keys();
}
