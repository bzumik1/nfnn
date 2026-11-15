package cz.novanadeje.app.donors.domain;

import java.time.Duration;
import java.time.Instant;

public final class UnconfirmedRegistration {

    public static final Duration LIFETIME = Duration.ofDays(30);

    private UnconfirmedRegistration() {
    }

    public static Instant expiredWhenRegisteredBefore(Instant now) {
        return now.minus(LIFETIME);
    }
}
