package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlert;
import cz.novanadeje.app.operations.domain.alerts.OperationalAlertRepository;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Repository
class JpaOperationalAlertRepository implements OperationalAlertRepository {

    private final OperationalAlertJpaRepository jpa;
    private final EntityManager entityManager;

    JpaOperationalAlertRepository(OperationalAlertJpaRepository jpa, EntityManager entityManager) {
        this.jpa = jpa;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockChanges() {
        AdvisoryLock.OPERATIONAL_ALERT_CHANGES.acquireFor(entityManager);
    }

    @Override
    public Optional<OperationalAlert> find(MonitoredArea area) {
        return jpa.findById(area).map(OperationalAlertJpaEntity::toDomain);
    }

    @Override
    public List<OperationalAlert> findAll() {
        Map<MonitoredArea, OperationalAlert> stored = jpa.findAll().stream().map(OperationalAlertJpaEntity::toDomain)
                .collect(Collectors.toMap(OperationalAlert::area, Function.identity()));
        return Arrays.stream(MonitoredArea.values()).map(area -> stored.getOrDefault(area, OperationalAlert.closed(area))).toList();
    }

    @Override
    public void save(OperationalAlert alert) {
        jpa.save(OperationalAlertJpaEntity.fromDomain(alert));
    }
}
