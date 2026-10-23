package cz.novanadeje.app.operations.domain.logs;

import java.time.Instant;
import java.util.regex.Pattern;

public record LogFile(String name, long sizeBytes, Instant changedAt, boolean compressed) {

    public static final int MAX_NAME_LENGTH = 120;
    private static final Pattern SAFE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");
    private static final String COMPRESSED_SUFFIX = ".gz";

    public LogFile {
        if (!isValidName(name)) {
            throw new IllegalArgumentException("A log file name is a plain file name");
        }
        if (sizeBytes < 0 || changedAt == null) {
            throw new IllegalArgumentException("A log file has a size and a time of change");
        }
    }

    public static boolean isValidName(String name) {
        return name != null && name.length() <= MAX_NAME_LENGTH && SAFE_NAME.matcher(name).matches();
    }

    public static boolean isCompressed(String name) {
        return name.endsWith(COMPRESSED_SUFFIX);
    }
}
