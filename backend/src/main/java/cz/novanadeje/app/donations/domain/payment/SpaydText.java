package cz.novanadeje.app.donations.domain.payment;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

public record SpaydText(String value) {

    public static final int RECIPIENT_NAME_LENGTH = 35;
    public static final int MESSAGE_LENGTH = 60;

    private static final String KEPT_CHARACTERS = "0-9A-Z$+\\-./:";
    private static final Pattern FORMAT = Pattern.compile("(?:[" + KEPT_CHARACTERS + "]+(?: [" + KEPT_CHARACTERS + "]+)*)?");
    private static final Pattern REPLACED_BY_SPACE = Pattern.compile("[^ " + KEPT_CHARACTERS + "]");
    private static final Pattern MARKS = Pattern.compile("\\p{M}");
    private static final Pattern SPACES = Pattern.compile(" {2,}");

    public SpaydText {
        if (value == null) {
            throw new IllegalArgumentException("SPAYD text is required");
        }
        if (value.length() > MESSAGE_LENGTH || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("SPAYD text is up to " + MESSAGE_LENGTH + " characters of 0-9, A-Z, $ + - . / : and single spaces: " + value);
        }
    }

    public static SpaydText recipientName(String text) {
        return of(text, RECIPIENT_NAME_LENGTH);
    }

    public static SpaydText message(String text) {
        return of(text, MESSAGE_LENGTH);
    }

    public boolean isEmpty() {
        return value.isEmpty();
    }

    private static SpaydText of(String text, int maxLength) {
        if (text == null) {
            throw new IllegalArgumentException("A text to write as SPAYD text is required");
        }
        String withoutMarks = MARKS.matcher(Normalizer.normalize(text, Normalizer.Form.NFD)).replaceAll("");
        String kept = REPLACED_BY_SPACE.matcher(withoutMarks.toUpperCase(Locale.ROOT)).replaceAll(" ");
        String plain = SPACES.matcher(kept).replaceAll(" ").trim();
        return new SpaydText(plain.length() <= maxLength ? plain : plain.substring(0, maxLength).trim());
    }

    @Override
    public String toString() {
        return value;
    }
}
