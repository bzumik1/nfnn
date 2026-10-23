package cz.novanadeje.app.shared.domain;

import java.time.ZoneId;

public final class FoundationZone {

    public static final String ID = "Europe/Prague";
    public static final ZoneId ZONE = ZoneId.of(ID);

    private FoundationZone() {
    }
}
