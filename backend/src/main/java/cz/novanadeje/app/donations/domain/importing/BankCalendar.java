package cz.novanadeje.app.donations.domain.importing;

import cz.novanadeje.app.donations.domain.FoundationCalendar;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

public final class BankCalendar {

    public static final ZoneId ZONE = FoundationCalendar.ZONE;

    private BankCalendar() {
    }

    public static LocalDate today(Clock clock) {
        return FoundationCalendar.today(clock);
    }
}
