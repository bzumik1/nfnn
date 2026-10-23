package cz.novanadeje.app.content.domain.news;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

public record Slug(String value) {

    public static final int MAX_LENGTH = 80;
    public static final String SHAPE_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*$";
    private static final Pattern SHAPE = Pattern.compile(SHAPE_REGEX);
    private static final Pattern COMBINING_MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NOT_ALPHANUMERIC = Pattern.compile("[^a-z0-9]+");

    public Slug {
        if (value == null || value.length() > MAX_LENGTH || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("A slug is 1 to " + MAX_LENGTH + " lower-case letters, digits and single hyphens: " + value);
        }
    }

    public static Slug fromText(String text) {
        String ascii = COMBINING_MARKS.matcher(Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)).replaceAll("");
        String joined = NOT_ALPHANUMERIC.matcher(ascii.toLowerCase(Locale.ROOT)).replaceAll("-");
        String trimmed = joined.replaceAll("^-+|-+$", "");
        if (trimmed.length() > MAX_LENGTH) {
            trimmed = trimmed.substring(0, MAX_LENGTH).replaceAll("-+$", "");
        }
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("No slug can be made from the text");
        }
        return new Slug(trimmed);
    }

    @Override
    public String toString() {
        return value;
    }
}
