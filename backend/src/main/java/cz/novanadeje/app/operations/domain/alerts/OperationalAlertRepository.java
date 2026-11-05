package cz.novanadeje.app.operations.domain.alerts;

import java.util.List;
import java.util.Optional;

public interface OperationalAlertRepository {

    void lockChanges();

    Optional<OperationalAlert> find(MonitoredArea area);

    List<OperationalAlert> findAll();

    void save(OperationalAlert alert);
}
