package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

interface BackupAlertJpaRepository extends JpaRepository<BackupAlertJpaEntity, UUID> {

    @Query("select a from BackupAlertJpaEntity a where a.outcome is null order by a.createdAt, a.id")
    List<BackupAlertJpaEntity> findWaiting();

    @Transactional(propagation = Propagation.MANDATORY)
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BackupAlertJpaEntity a set a.outcome = 'SENT', a.settledAt = :at where a.id = :id and a.outcome is null")
    int markSent(@Param("id") UUID id, @Param("at") Instant at);

    @Transactional(propagation = Propagation.MANDATORY)
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BackupAlertJpaEntity a set a.outcome = 'DROPPED', a.settledAt = :at where a.outcome is null")
    int dropWaiting(@Param("at") Instant at);
}
