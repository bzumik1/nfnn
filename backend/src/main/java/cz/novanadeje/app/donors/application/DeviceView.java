package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.SessionKind;

import java.time.Instant;

public record DeviceView(DeviceId id, DeviceDescription description, SessionKind session, Instant signedInAt, Instant lastUsedAt, boolean current) {
}
