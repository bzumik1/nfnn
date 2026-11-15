package cz.novanadeje.app.donors.domain;

import java.time.Duration;
import java.time.Instant;

public final class SessionRecordRetention {

    private static final Duration SPENT_TOKENS = Duration.ofDays(30);
    private static final Duration SPENT_SECRETS = Duration.ofDays(30);
    private static final Duration ENDED_DEVICES = Duration.ofDays(400);

    private SessionRecordRetention() {
    }

    public static Instant spentTokensCutoff(Instant now) {
        return now.minus(SPENT_TOKENS);
    }

    public static Instant spentSecretsCutoff(Instant now) {
        return now.minus(SPENT_SECRETS);
    }

    public static Instant endedDevicesCutoff(Instant now) {
        return now.minus(ENDED_DEVICES);
    }
}
