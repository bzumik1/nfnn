package cz.novanadeje.app.donations.domain.bank;

import java.util.Optional;

final class BankTexts {

    private BankTexts() {
    }

    static Optional<String> normalized(Optional<String> value, int width) {
        return require(value, "Optional text").map(String::trim).filter(text -> !text.isEmpty()).map(text -> cut(text, width));
    }

    static String required(String value, int width, String label) {
        return cut(require(value, label).trim(), width);
    }

    static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }

    private static String cut(String text, int width) {
        if (text.codePointCount(0, text.length()) <= width) {
            return text;
        }
        return text.substring(0, text.offsetByCodePoints(0, width));
    }
}
