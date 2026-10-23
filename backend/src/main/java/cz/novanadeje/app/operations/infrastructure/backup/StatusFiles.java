package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

final class StatusFiles {

    private static final Logger log = LoggerFactory.getLogger(StatusFiles.class);

    private StatusFiles() {
    }

    static Optional<BackupRun> read(Path file) {
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return parse(Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException unreadable) {
            log.warn("The backup status file {} cannot be read: {}", file.getFileName(), unreadable.getClass().getSimpleName());
            return Optional.empty();
        } catch (IllegalArgumentException | DateTimeParseException malformed) {
            log.warn("The backup status file {} is not understood: {}", file.getFileName(), malformed.getMessage());
            return Optional.empty();
        }
    }

    static Optional<BackupRun> parse(String content) {
        Map<String, String> values = new HashMap<>();
        for (String line : content.split("\n")) {
            int separator = line.indexOf('=');
            if (separator > 0) {
                values.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
            }
        }
        if (values.isEmpty()) {
            return Optional.empty();
        }
        RunOutcome outcome = switch (required(values, "outcome")) {
            case "ok" -> RunOutcome.OK;
            case "failed" -> RunOutcome.FAILED;
            default -> throw new IllegalArgumentException("outcome is ok or failed");
        };
        return Optional.of(new BackupRun(outcome, Instant.parse(required(values, "started_at")), Instant.parse(required(values, "finished_at")),
                optional(values, "file"), optional(values, "size").map(Long::parseLong), optional(values, "tables").map(Integer::parseInt),
                optional(values, "request"), optional(values, "admin").map(UUID::fromString), optional(values, "error")));
    }

    private static String required(Map<String, String> values, String key) {
        return optional(values, key).orElseThrow(() -> new IllegalArgumentException("the line " + key + "= is missing"));
    }

    private static Optional<String> optional(Map<String, String> values, String key) {
        return Optional.ofNullable(values.get(key)).filter(value -> !value.isEmpty());
    }
}
