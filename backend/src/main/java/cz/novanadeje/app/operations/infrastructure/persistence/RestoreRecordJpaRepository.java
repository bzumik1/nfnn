package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

interface RestoreRecordJpaRepository extends JpaRepository<RestoreRecordJpaEntity, String> {

    @Modifying
    @Query(value = "insert into operations_restore_record (request_id, recorded_at) values (:requestId, :recordedAt) on conflict do nothing",
            nativeQuery = true)
    int insertIfAbsent(@Param("requestId") String requestId, @Param("recordedAt") Instant recordedAt);
}
