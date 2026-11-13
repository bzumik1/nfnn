package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.push.DonorPushDeviceView;
import cz.novanadeje.app.operations.application.push.DonorPushView;
import cz.novanadeje.app.operations.domain.push.DonorNotifications;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

record DonorPushResponse(String publicKey, boolean deviceSession, Device device, List<UUID> devices) {

    static DonorPushResponse from(DonorPushView view) {
        return new DonorPushResponse(view.publicKey(), view.deviceSession(), view.device().map(Device::from).orElse(null), view.devices());
    }

    record Device(String service, Notifications notifications, Instant createdAt, Instant lastDeliveredAt, int failuresInARow) {

        static Device from(DonorPushDeviceView view) {
            return new Device(view.service().name().toLowerCase(Locale.ROOT), Notifications.from(view.notifications()), view.createdAt(),
                    view.lastDeliveredAt().orElse(null), view.failuresInARow());
        }
    }

    record Notifications(boolean gifts, boolean yearlyReceipts) {

        static Notifications from(DonorNotifications notifications) {
            return new Notifications(notifications.gifts(), notifications.yearlyReceipts());
        }
    }
}
