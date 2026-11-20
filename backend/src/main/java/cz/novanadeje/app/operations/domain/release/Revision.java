package cz.novanadeje.app.operations.domain.release;

import java.util.Optional;
import java.util.regex.Pattern;

public record Revision(String value) {

    public static final int MAX_LENGTH = 40;

    private static final Pattern SHAPE = Pattern.compile("[0-9A-Za-z._-]{1," + MAX_LENGTH + "}");

    public Revision {
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("A revision is 1 to " + MAX_LENGTH + " letters, digits, dots, dashes or underscores");
        }
    }

    public static Optional<Revision> parse(String text) {
        if (text == null || text.length() > MAX_LENGTH || !SHAPE.matcher(text).matches()) {
            return Optional.empty();
        }
        return Optional.of(new Revision(text));
    }

    @Override
    public String toString() {
        return value;
    }
}
