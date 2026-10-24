package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface BackupScheduleJpaRepository extends JpaRepository<BackupScheduleJpaEntity, Short> {
}
