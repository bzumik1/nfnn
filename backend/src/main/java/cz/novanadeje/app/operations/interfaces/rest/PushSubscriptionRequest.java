package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import cz.novanadeje.app.operations.domain.push.PushClientKeys;
import cz.novanadeje.app.operations.domain.push.PushEndpoint;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record PushSubscriptionRequest(
        @NotBlank @Size(max = PushEndpoint.MAX_LENGTH) String endpoint,
        @NotNull @Valid Keys keys,
        @Valid PushAlertsRequest alerts) {

    PushEndpoint toEndpoint() {
        return new PushEndpoint(endpoint);
    }

    PushClientKeys toKeys() {
        return new PushClientKeys(keys.p256dh(), keys.auth());
    }

    PushAlerts toAlerts() {
        return alerts == null ? PushAlerts.ALL : alerts.toAlerts();
    }

    @Override
    public String toString() {
        return "PushSubscriptionRequest[<secret>]";
    }

    record Keys(@NotBlank @Size(max = PushClientKeys.MAX_LENGTH) String p256dh, @NotBlank @Size(max = PushClientKeys.MAX_LENGTH) String auth) {

        @Override
        public String toString() {
            return "Keys[<secret>]";
        }
    }
}
