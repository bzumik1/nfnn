package cz.novanadeje.app.donations.domain.importing;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

public final class BankCalendar {

    public static final ZoneId ZONE = ZoneId.of("Europe/Prague");

    private BankCalendar() {
    }

    public static LocalDate today(Clock clock) {
        return clock.instant().atZone(ZONE).toLocalDate();
    }
}
