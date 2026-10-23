package cz.novanadeje.app.operations.domain.backup;

import java.util.Optional;

public enum RestoreFileState {
    PENDING(".dump"), DONE(".dump.done"), FAILED(".dump.failed"), SKIPPED(".dump.skipped");

    private final String suffix;

    RestoreFileState(String suffix) {
        this.suffix = suffix;
    }

    public static Optional<RestoreFileState> ofFileName(String fileName) {
        for (RestoreFileState state : values()) {
            if (fileName.endsWith(state.suffix)) {
                return Optional.of(state);
            }
        }
        return Optional.empty();
    }
}
