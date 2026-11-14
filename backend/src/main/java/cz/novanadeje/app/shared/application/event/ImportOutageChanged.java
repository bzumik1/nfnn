package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Objects;

public record ImportOutageChanged(Change change, Instant at) {

    public enum Change {
        OPENED,
        RESOLVED
    }

    public ImportOutageChanged {
        Objects.requireNonNull(change, "change");
        Objects.requireNonNull(at, "at");
    }

    public static ImportOutageChanged opened(Instant at) {
        return new ImportOutageChanged(Change.OPENED, at);
    }

    public static ImportOutageChanged resolved(Instant at) {
        return new ImportOutageChanged(Change.RESOLVED, at);
    }
}
