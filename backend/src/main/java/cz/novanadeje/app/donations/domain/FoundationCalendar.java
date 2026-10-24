package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.FoundationZone;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

public final class FoundationCalendar {

    public static final String ZONE_ID = FoundationZone.ID;
    public static final ZoneId ZONE = FoundationZone.ZONE;

    private FoundationCalendar() {
    }

    public static LocalDate today(Clock clock) {
        return clock.instant().atZone(ZONE).toLocalDate();
    }

    public static LocalDateTime now(Clock clock) {
        return clock.instant().atZone(ZONE).toLocalDateTime();
    }
}
