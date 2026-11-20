package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

interface ReleaseRunJpaRepository extends JpaRepository<ReleaseRunJpaEntity, UUID> {

    List<ReleaseRunJpaEntity> findAllByOrderByStartedAtDescIdDesc(Limit limit);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            delete from operations_release_run ended
            where exists (select 1 from operations_release_run successor
                          where successor.started_at < :cutoff
                            and (successor.started_at, successor.id) > (ended.started_at, ended.id))""", nativeQuery = true)
    int deleteEndedBefore(@Param("cutoff") Instant cutoff);
}
