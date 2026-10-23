package cz.novanadeje.app.operations.application.logs;

import cz.novanadeje.app.operations.domain.logs.LogFile;
import cz.novanadeje.app.operations.domain.logs.LogMatch;
import cz.novanadeje.app.operations.domain.logs.LogWindow;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

public interface LogStore {

    boolean isAvailable();

    List<LogFile> files();

    Optional<LogFile> file(String name);

    LogWindow read(LogFile file, Optional<Long> from, int bytes);

    List<LogMatch> search(LogFile file, Pattern pattern, int limit, Optional<Long> before);
}
