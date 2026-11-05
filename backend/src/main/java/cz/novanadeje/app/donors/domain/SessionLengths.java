package cz.novanadeje.app.donors.domain;

import java.time.Duration;
import java.time.Instant;

public record SessionLengths(int rememberedDays) {

    public static final int MIN_REMEMBERED_DAYS = 1;
    public static final int MAX_REMEMBERED_DAYS = 30;
    public static final Duration APP = Duration.ofDays(400);
    public static final Duration BROWSER_IDLE = Duration.ofHours(12);
    public static final Duration PUBLIC_IDLE = Duration.ofHours(1);
    public static final Duration PUBLIC_ABSOLUTE = Duration.ofHours(12);

    public SessionLengths {
        if (rememberedDays < MIN_REMEMBERED_DAYS || rememberedDays > MAX_REMEMBERED_DAYS) {
            throw new IllegalArgumentException("A remembered sign-in lasts " + MIN_REMEMBERED_DAYS + " to " + MAX_REMEMBERED_DAYS
                    + " days, not " + rememberedDays);
        }
    }

    public Instant expiresAt(SessionKind kind, Instant signedInAt, Instant now) {
        return switch (kind) {
            case APP -> now.plus(APP);
            case REMEMBERED -> now.plus(Duration.ofDays(rememberedDays));
            case BROWSER -> now.plus(BROWSER_IDLE);
            case PUBLIC -> earlier(now.plus(PUBLIC_IDLE), signedInAt.plus(PUBLIC_ABSOLUTE));
        };
    }

    private static Instant earlier(Instant one, Instant other) {
        return one.isBefore(other) ? one : other;
    }
}
