package cz.novanadeje.app.operations.application.logs;

import cz.novanadeje.app.operations.domain.logs.InvalidLogPattern;
import cz.novanadeje.app.operations.domain.logs.LogFile;
import cz.novanadeje.app.operations.domain.logs.LogFileNotFound;
import cz.novanadeje.app.operations.domain.logs.LogMatch;
import cz.novanadeje.app.operations.domain.logs.LogReadLimits;
import cz.novanadeje.app.operations.domain.logs.LogSearchResult;
import cz.novanadeje.app.operations.domain.logs.LogWindow;
import cz.novanadeje.app.operations.domain.logs.LogsUnavailable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

@Service
public class LogReadingService {

    private final LogStore store;

    public LogReadingService(LogStore store) {
        this.store = store;
    }

    public LogFilesView files() {
        if (!store.isAvailable()) {
            return LogFilesView.unavailable();
        }
        return new LogFilesView(true, store.files());
    }

    public LogWindow read(String name, Optional<Long> from, Integer bytes) {
        return store.read(existing(name), from, LogReadLimits.windowBytes(bytes));
    }

    public LogSearchResult search(String name, String pattern, Integer limit, Optional<Long> before) {
        LogFile file = existing(name);
        Pattern compiled = compile(pattern);
        int wanted = LogReadLimits.matches(limit);
        List<LogMatch> matches = store.search(file, compiled, wanted + 1, before);
        boolean moreOlder = matches.size() > wanted;
        List<LogMatch> kept = moreOlder ? matches.subList(0, wanted) : matches;
        long scannedFrom = moreOlder ? kept.getLast().offset() : 0;
        return new LogSearchResult(file.name(), file.sizeBytes(), scannedFrom, kept, moreOlder);
    }

    private LogFile existing(String name) {
        if (!store.isAvailable()) {
            throw new LogsUnavailable();
        }
        if (!LogFile.isValidName(name)) {
            throw new LogFileNotFound();
        }
        return store.file(name).orElseThrow(LogFileNotFound::new);
    }

    private static Pattern compile(String pattern) {
        if (pattern == null || pattern.isBlank() || pattern.length() > LogReadLimits.MAX_PATTERN_LENGTH) {
            throw new InvalidLogPattern();
        }
        try {
            return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE);
        } catch (PatternSyntaxException e) {
            throw new InvalidLogPattern();
        }
    }
}
