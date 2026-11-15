package cz.novanadeje.app.donors.domain;

import java.time.Duration;
import java.time.Instant;

public final class UnconfirmedRegistration {

    public static final Duration LIFETIME = Duration.ofDays(30);

    private UnconfirmedRegistration() {
    }

    public static Instant deletionCutoff(Instant now) {
        return now.minus(LIFETIME);
    }

    public static boolean outlivesReminderWindow(Duration window) {
        return window.compareTo(LIFETIME) < 0;
    }
}
