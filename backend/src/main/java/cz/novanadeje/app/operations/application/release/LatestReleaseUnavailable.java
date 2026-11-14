package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;

import java.util.Locale;

public class LatestReleaseUnavailable extends RuntimeException {

    private static final int LOWEST_STATUS = 100;
    private static final int HIGHEST_STATUS = 999;

    private final ReleaseCheckFailure failure;
    private final String outcome;

    public LatestReleaseUnavailable(ReleaseCheckFailure failure) {
        this(requireWithoutStatus(failure), wordOf(failure));
    }

    private LatestReleaseUnavailable(ReleaseCheckFailure failure, String outcome) {
        super(outcome, null, false, false);
        this.failure = failure;
        this.outcome = outcome;
    }

    public static LatestReleaseUnavailable status(int status) {
        if (status < LOWEST_STATUS || status > HIGHEST_STATUS) {
            throw new IllegalArgumentException("status must be an HTTP status");
        }
        return new LatestReleaseUnavailable(ReleaseCheckFailure.STATUS, wordOf(ReleaseCheckFailure.STATUS) + " " + status);
    }

    public static String wordOf(ReleaseCheckFailure failure) {
        return failure.name().toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    public ReleaseCheckFailure failure() {
        return failure;
    }

    public String outcome() {
        return outcome;
    }

    private static ReleaseCheckFailure requireWithoutStatus(ReleaseCheckFailure failure) {
        if (failure == ReleaseCheckFailure.STATUS) {
            throw new IllegalArgumentException("failure needs its status");
        }
        return failure;
    }
}
