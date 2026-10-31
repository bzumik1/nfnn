package cz.novanadeje.app.operations.domain.clienterrors;

import java.util.regex.Pattern;

public record ClientAppVersion(String value) {

    public static final int MAX_LENGTH = 40;
    private static final Pattern VERSION = Pattern.compile("[0-9a-f]{7,40}|dev");

    public ClientAppVersion {
        if (!isValid(value)) {
            throw new IllegalArgumentException("An app version is a lowercase commit id of 7 to 40 characters or dev");
        }
    }

    public static boolean isValid(String value) {
        return value != null && VERSION.matcher(value).matches();
    }
}
