package cz.novanadeje.app.donors.application;

import java.util.Optional;

public class CompanyRegistryUnavailable extends RuntimeException {

    private static final int LOWEST_STATUS = 100;
    private static final int HIGHEST_STATUS = 599;

    private final CompanyRegistryFailure failure;
    private final String outcome;
    private final transient CompanyRegistryPause pause;

    public CompanyRegistryUnavailable(CompanyRegistryFailure failure) {
        this(requireWithoutDetail(failure), failure.word(), null);
    }

    private CompanyRegistryUnavailable(CompanyRegistryFailure failure, String outcome, CompanyRegistryPause pause) {
        super(outcome, null, false, false);
        this.failure = failure;
        this.outcome = outcome;
        this.pause = pause;
    }

    public static CompanyRegistryUnavailable status(int status) {
        if (status < LOWEST_STATUS || status > HIGHEST_STATUS) {
            throw new IllegalArgumentException("status must be an HTTP status");
        }
        return new CompanyRegistryUnavailable(CompanyRegistryFailure.STATUS, CompanyRegistryFailure.STATUS.word() + " " + status, null);
    }

    public static CompanyRegistryUnavailable unexpected(RuntimeException exception) {
        return new CompanyRegistryUnavailable(CompanyRegistryFailure.UNEXPECTED_EXCEPTION, exception.getClass().getSimpleName(), null);
    }

    public CompanyRegistryUnavailable pausing(CompanyRegistryPause startedPause) {
        return new CompanyRegistryUnavailable(failure, outcome, startedPause);
    }

    public CompanyRegistryFailure failure() {
        return failure;
    }

    public String outcome() {
        return outcome;
    }

    public Optional<CompanyRegistryPause> pause() {
        return Optional.ofNullable(pause);
    }

    private static CompanyRegistryFailure requireWithoutDetail(CompanyRegistryFailure failure) {
        if (failure == CompanyRegistryFailure.STATUS || failure == CompanyRegistryFailure.UNEXPECTED_EXCEPTION) {
            throw new IllegalArgumentException("failure needs its status or exception class");
        }
        return failure;
    }
}
