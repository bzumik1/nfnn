package cz.novanadeje.app.donors.application;

public enum CompanyRegistryFailure {

    STATUS("status"),
    UNEXPECTED_RESPONSE("unexpected response"),
    TOO_LARGE("too large"),
    TIMEOUT("timeout"),
    UNREACHABLE("unreachable"),
    UNKNOWN_HOST("unknown host"),
    NON_PUBLIC_ADDRESS("non-public address"),
    NOT_HTTPS("not https"),
    INTERRUPTED("interrupted"),
    UNEXPECTED_EXCEPTION("unexpected exception"),
    PAUSED("paused");

    private final String word;

    CompanyRegistryFailure(String word) {
        this.word = word;
    }

    public String word() {
        return word;
    }
}
