package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

final class BackupScheduleFiles {

    private static final String BACKUP_TIME = "backup_time";
    private static final String TEST_RESTORE_DAY = "test_restore_day";
    private static final String TEST_RESTORE_TIME = "test_restore_time";
    private static final Pattern TIME = Pattern.compile("([01][0-9]|2[0-3]):[0-5][0-9]");
    private static final Pattern DAY = Pattern.compile("[1-7]");
    private static final DateTimeFormatter HOURS_AND_MINUTES = DateTimeFormatter.ofPattern("HH:mm");

    private static final Logger log = LoggerFactory.getLogger(BackupScheduleFiles.class);

    private BackupScheduleFiles() {
    }

    static String format(BackupSchedule schedule) {
        return BACKUP_TIME + "=" + HOURS_AND_MINUTES.format(schedule.backupTime()) + "\n"
                + TEST_RESTORE_DAY + "=" + schedule.testRestoreDay().getValue() + "\n"
                + TEST_RESTORE_TIME + "=" + HOURS_AND_MINUTES.format(schedule.testRestoreTime()) + "\n";
    }

    static Optional<BackupSchedule> read(Path file) {
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return parse(Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException unreadable) {
            log.warn("The backup schedule file {} cannot be read: {}", file.getFileName(), unreadable.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    static Optional<BackupSchedule> parse(String content) {
        Map<String, String> values = new HashMap<>();
        for (String line : content.split("\n")) {
            int separator = line.indexOf('=');
            if (separator > 0) {
                values.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
            }
        }
        String backupTime = values.getOrDefault(BACKUP_TIME, "");
        String testRestoreDay = values.getOrDefault(TEST_RESTORE_DAY, "");
        String testRestoreTime = values.getOrDefault(TEST_RESTORE_TIME, "");
        if (!TIME.matcher(backupTime).matches() || !DAY.matcher(testRestoreDay).matches() || !TIME.matcher(testRestoreTime).matches()) {
            log.warn("The backup schedule file is not understood");
            return Optional.empty();
        }
        try {
            return Optional.of(new BackupSchedule(LocalTime.parse(backupTime, HOURS_AND_MINUTES), DayOfWeek.of(Integer.parseInt(testRestoreDay)),
                    LocalTime.parse(testRestoreTime, HOURS_AND_MINUTES)));
        } catch (DateTimeParseException malformed) {
            log.warn("The backup schedule file is not understood: {}", malformed.getMessage());
            return Optional.empty();
        }
    }
}
