package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record BackupFile(String name, long sizeBytes, Instant createdAt) {

    public static final int MAX_NAME_LENGTH = 80;

    private static final Pattern NAME = Pattern.compile("nfnn-\\d{4}-\\d{2}-\\d{2}_\\d{4}(-[a-z0-9-]{1,40})?\\.dump");
    private static final String REQUESTED_SUFFIX = "-rucni";
    private static final String BEFORE_RESTORE_SUFFIX = "-pred-obnovou";

    public BackupFile {
        if (!isValidName(name)) {
            throw new IllegalArgumentException("A backup is named nfnn-<date>_<time>[-<suffix>].dump");
        }
        if (sizeBytes < 0) {
            throw new IllegalArgumentException("A backup's size is not negative");
        }
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public static boolean isValidName(String name) {
        return name != null && name.length() <= MAX_NAME_LENGTH && NAME.matcher(name).matches();
    }

    public BackupKind kind() {
        Matcher matcher = NAME.matcher(name);
        if (!matcher.matches() || matcher.group(1) == null) {
            return BackupKind.DAILY;
        }
        return switch (matcher.group(1)) {
            case REQUESTED_SUFFIX -> BackupKind.REQUESTED;
            case BEFORE_RESTORE_SUFFIX -> BackupKind.BEFORE_RESTORE;
            default -> BackupKind.OTHER;
        };
    }
}
