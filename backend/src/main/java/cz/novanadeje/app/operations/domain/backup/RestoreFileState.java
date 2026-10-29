package cz.novanadeje.app.operations.domain.backup;

import java.util.List;
import java.util.Optional;

public enum RestoreFileState {
    PENDING(""), DONE(".done"), FAILED(".failed"), SKIPPED(".skipped");

    private static final List<String> DUMP_EXTENSIONS = List.of(".dump", ".dump.age");

    private final String suffix;

    RestoreFileState(String suffix) {
        this.suffix = suffix;
    }

    public static Optional<RestoreFileState> ofFileName(String fileName) {
        for (RestoreFileState state : values()) {
            for (String extension : DUMP_EXTENSIONS) {
                if (fileName.endsWith(extension + state.suffix)) {
                    return Optional.of(state);
                }
            }
        }
        return Optional.empty();
    }
}
