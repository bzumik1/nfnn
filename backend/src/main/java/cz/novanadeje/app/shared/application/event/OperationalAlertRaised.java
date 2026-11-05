package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Objects;

public record OperationalAlertRaised(Area area, Change change, Instant at) {

    public enum Area {
        BANK_IMPORT,
        BACKUPS,
        MAIL
    }

    public enum Change {
        OPENED,
        RESOLVED
    }

    public OperationalAlertRaised {
        Objects.requireNonNull(area, "area");
        Objects.requireNonNull(change, "change");
        Objects.requireNonNull(at, "at");
    }

    public static OperationalAlertRaised opened(Area area, Instant at) {
        return new OperationalAlertRaised(area, Change.OPENED, at);
    }

    public static OperationalAlertRaised resolved(Area area, Instant at) {
        return new OperationalAlertRaised(area, Change.RESOLVED, at);
    }
}
