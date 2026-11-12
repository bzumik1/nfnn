package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record DonorPushDeviceRequest(
        @NotBlank @Size(max = PushEndpoint.MAX_LENGTH) String endpoint,
        @NotNull @Valid PushSubscriptionRequest.Keys keys,
        @Valid DonorNotificationsRequest notifications) {

    PushEndpoint toEndpoint() {
        return new PushEndpoint(endpoint);
    }

    PushClientKeys toKeys() {
        return new PushClientKeys(keys.p256dh(), keys.auth());
    }

    DonorNotifications toNotifications() {
        return notifications == null ? DonorNotifications.ALL : notifications.toNotifications();
    }

    @Override
    public String toString() {
        return "DonorPushDeviceRequest[<secret>]";
    }
}
