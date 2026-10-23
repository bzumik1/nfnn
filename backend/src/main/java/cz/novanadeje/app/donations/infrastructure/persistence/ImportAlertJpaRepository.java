package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ImportAlertJpaRepository extends JpaRepository<ImportAlertJpaEntity, UUID> {

    @Query("select a from ImportAlertJpaEntity a where a.outcome is null order by a.createdAt, a.id")
    List<ImportAlertJpaEntity> findWaiting();

    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ImportAlertJpaEntity a set a.outcome = 'SENT', a.settledAt = :at where a.id = :id and a.outcome is null")
    int markSent(@Param("id") UUID id, @Param("at") Instant at);

    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ImportAlertJpaEntity a set a.outcome = 'DROPPED', a.settledAt = :at where a.kind = :kind and a.outcome is null")
    int dropWaiting(@Param("kind") ImportAlertJpaEntity.Kind kind, @Param("at") Instant at);
}
