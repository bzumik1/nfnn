package cz.novanadeje.app.donations.domain;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

public final class FoundationCalendar {

    public static final String ZONE_ID = "Europe/Prague";
    public static final ZoneId ZONE = ZoneId.of(ZONE_ID);

    private FoundationCalendar() {
    }

    public static LocalDate today(Clock clock) {
        return clock.instant().atZone(ZONE).toLocalDate();
    }
}
