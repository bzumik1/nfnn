package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import org.springframework.data.jpa.repository.JpaRepository;

interface OperationalAlertJpaRepository extends JpaRepository<OperationalAlertJpaEntity, MonitoredArea> {
}
