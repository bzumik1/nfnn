package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.push.DonorNotifications;
import jakarta.validation.constraints.NotNull;

record DonorNotificationsRequest(@NotNull Boolean gifts, @NotNull Boolean yearlyReceipts) {

    DonorNotifications toNotifications() {
        return new DonorNotifications(gifts, yearlyReceipts);
    }
}
