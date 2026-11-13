package cz.novanadeje.app.donations.application.bankcode;

public enum BankCodeSourceFailure {

    STATUS("status"),
    REFUSED_LIST("refused list"),
    TOO_LARGE("too large"),
    TIMEOUT("timeout"),
    UNREACHABLE("unreachable"),
    UNKNOWN_HOST("unknown host"),
    NON_PUBLIC_ADDRESS("non-public address"),
    NOT_HTTPS("not https"),
    INTERRUPTED("interrupted");

    private final String word;

    BankCodeSourceFailure(String word) {
        this.word = word;
    }

    public String word() {
        return word;
    }
}
