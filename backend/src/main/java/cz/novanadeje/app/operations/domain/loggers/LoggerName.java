package cz.novanadeje.app.operations.domain.loggers;

import java.util.regex.Pattern;

public record LoggerName(String value) {

    public static final String ROOT = "ROOT";
    public static final int MAX_LENGTH = 200;
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_$][A-Za-z0-9_$.]*");

    public LoggerName {
        if (!isValid(value)) {
            throw new IllegalArgumentException("A logger name is ROOT or a dotted Java name");
        }
    }

    public static boolean isValid(String value) {
        return value != null && value.length() <= MAX_LENGTH && (ROOT.equals(value) || NAME.matcher(value).matches());
    }
}
