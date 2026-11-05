package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;

import java.time.Instant;

public record DeviceView(DeviceId id, DeviceDescription description, Instant signedInAt, Instant lastUsedAt, boolean current) {
}
