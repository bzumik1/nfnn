package cz.novanadeje.app.operations.application.event;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;

import java.time.Instant;
import java.util.Objects;

public record OperationalAlertChanged(MonitoredArea area, boolean opened, long changes, int openCount, Instant at) {

    public OperationalAlertChanged {
        Objects.requireNonNull(area, "area");
        Objects.requireNonNull(at, "at");
        if (changes < 1 || openCount < 0 || openCount > MonitoredArea.values().length) {
            throw new IllegalArgumentException("A change of an alert is counted and leaves between none and every area open");
        }
    }
}
