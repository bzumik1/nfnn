package cz.novanadeje.fio;

import java.util.regex.Pattern;

public final class FioToken {

    private static final Pattern URL_PATH_SAFE = Pattern.compile("[A-Za-z0-9_-]+");
    private static final String MASK = "***";

    private final String value;

    private FioToken(String value) {
        this.value = value;
    }

    public static FioToken of(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("A Fio API token is required");
        }
        String stripped = value.strip();
        if (!URL_PATH_SAFE.matcher(stripped).matches()) {
            throw new IllegalArgumentException("A Fio API token may contain only letters, digits, '-' and '_'");
        }
        return new FioToken(stripped);
    }

    String value() {
        return value;
    }

    String mask(String text) {
        return text == null ? null : text.replace(value, MASK);
    }

    boolean occursIn(String text) {
        return text != null && text.contains(value);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof FioToken token && token.value.equals(value);
    }

    @Override
    public int hashCode() {
        return value.hashCode();
    }

    @Override
    public String toString() {
        return "FioToken[" + MASK + "]";
    }
}
