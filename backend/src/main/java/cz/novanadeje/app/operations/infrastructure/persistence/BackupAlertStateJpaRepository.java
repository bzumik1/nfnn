package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface BackupAlertStateJpaRepository extends JpaRepository<BackupAlertStateJpaEntity, Short> {
}
