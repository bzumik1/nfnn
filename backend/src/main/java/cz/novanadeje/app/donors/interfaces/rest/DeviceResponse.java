package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DeviceView;

import java.time.Instant;
import java.util.UUID;

record DeviceResponse(UUID id, String platform, String browser, String session, Instant signedInAt, Instant lastUsedAt, boolean current) {

    static DeviceResponse of(DeviceView view) {
        return new DeviceResponse(view.id().value(), view.description().platform().name(), view.description().browser().name(),
                view.session().name(), view.signedInAt(), view.lastUsedAt(), view.current());
    }
}
