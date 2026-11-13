package cz.novanadeje.app.donations.application.bankcode;

public class BankCodeSourceUnavailable extends RuntimeException {

    private static final int LOWEST_STATUS = 100;
    private static final int HIGHEST_STATUS = 999;

    private final BankCodeSourceFailure failure;
    private final String outcome;

    public BankCodeSourceUnavailable(BankCodeSourceFailure failure) {
        this(requireWithoutStatus(failure), failure.word());
    }

    private BankCodeSourceUnavailable(BankCodeSourceFailure failure, String outcome) {
        super(outcome, null, false, false);
        this.failure = failure;
        this.outcome = outcome;
    }

    public static BankCodeSourceUnavailable status(int status) {
        if (status < LOWEST_STATUS || status > HIGHEST_STATUS) {
            throw new IllegalArgumentException("status must be an HTTP status");
        }
        return new BankCodeSourceUnavailable(BankCodeSourceFailure.STATUS, BankCodeSourceFailure.STATUS.word() + " " + status);
    }

    public BankCodeSourceFailure failure() {
        return failure;
    }

    public String outcome() {
        return outcome;
    }

    private static BankCodeSourceFailure requireWithoutStatus(BankCodeSourceFailure failure) {
        if (failure == BankCodeSourceFailure.STATUS) {
            throw new IllegalArgumentException("failure needs its status");
        }
        return failure;
    }
}
