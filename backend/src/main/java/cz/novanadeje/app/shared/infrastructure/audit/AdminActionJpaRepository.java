package cz.novanadeje.app.shared.infrastructure.audit;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

interface AdminActionJpaRepository extends JpaRepository<AdminActionJpaEntity, UUID> {

    List<AdminActionJpaEntity> findByPerformedAtLessThanOrderByPerformedAtDescIdDesc(Instant before, Limit limit);

    List<AdminActionJpaEntity> findByActionInOrderByPerformedAtAscIdAsc(Collection<String> actions);

    long countByAdminIdAndActionAndPerformedAtGreaterThanEqual(UUID adminId, String action, Instant since);
}
