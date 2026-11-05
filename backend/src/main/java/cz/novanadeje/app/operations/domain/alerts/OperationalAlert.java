package cz.novanadeje.app.operations.domain.alerts;

import java.time.Instant;
import java.util.Optional;

public record OperationalAlert(MonitoredArea area, Optional<Instant> openSince, long changes) {

    public OperationalAlert {
        if (area == null || openSince == null || changes < 0) {
            throw new IllegalArgumentException("An operational alert names its area, whether it is open and how often it changed");
        }
    }

    public static OperationalAlert closed(MonitoredArea area) {
        return new OperationalAlert(area, Optional.empty(), 0);
    }

    public boolean open() {
        return openSince.isPresent();
    }

    public Optional<OperationalAlert> openedAt(Instant at) {
        return open() ? Optional.empty() : Optional.of(new OperationalAlert(area, Optional.of(at), changes + 1));
    }

    public Optional<OperationalAlert> resolved() {
        return open() ? Optional.of(new OperationalAlert(area, Optional.empty(), changes + 1)) : Optional.empty();
    }
}
