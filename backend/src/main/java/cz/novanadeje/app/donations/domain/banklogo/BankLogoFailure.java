package cz.novanadeje.app.donations.domain.banklogo;

import java.util.Arrays;

public enum BankLogoFailure {

    STATUS("status"),
    REDIRECTED("redirected"),
    TIMEOUT("timeout"),
    UNREACHABLE("unreachable"),
    UNKNOWN_HOST("unknown-host"),
    NON_PUBLIC_ADDRESS("non-public-address"),
    TOO_LARGE("too-large"),
    UNSUPPORTED_TYPE("unsupported-type"),
    IMAGE_TOO_LARGE("image-too-large"),
    UNREADABLE_IMAGE("unreadable-image"),
    INTERRUPTED("interrupted");

    private final String word;

    BankLogoFailure(String word) {
        this.word = word;
    }

    public String word() {
        return word;
    }

    public static BankLogoFailure ofWord(String word) {
        return Arrays.stream(values()).filter(failure -> failure.word.equals(word)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown bank logo failure"));
    }
}
