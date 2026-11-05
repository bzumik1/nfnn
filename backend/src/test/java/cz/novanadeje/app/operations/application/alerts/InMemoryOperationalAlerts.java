package cz.novanadeje.app.operations.application.alerts;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlertRepository;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class InMemoryOperationalAlerts implements OperationalAlertRepository {

    private final Map<MonitoredArea, OperationalAlert> rows = new EnumMap<>(MonitoredArea.class);
    private int locks;

    @Override
    public synchronized void lockChanges() {
        locks++;
    }

    @Override
    public synchronized Optional<OperationalAlert> find(MonitoredArea area) {
        return Optional.ofNullable(rows.get(area));
    }

    @Override
    public synchronized List<OperationalAlert> findAll() {
        return Arrays.stream(MonitoredArea.values()).map(area -> rows.getOrDefault(area, OperationalAlert.closed(area))).toList();
    }

    @Override
    public synchronized void save(OperationalAlert alert) {
        rows.put(alert.area(), alert);
    }

    public synchronized int locks() {
        return locks;
    }
}
