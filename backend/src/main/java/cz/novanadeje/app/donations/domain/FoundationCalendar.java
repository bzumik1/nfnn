package cz.novanadeje.app.donations.domain;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

public final class FoundationCalendar {

    public static final ZoneId ZONE = ZoneId.of("Europe/Prague");

    private FoundationCalendar() {
    }

    public static LocalDate today(Clock clock) {
        return clock.instant().atZone(ZONE).toLocalDate();
    }
}
