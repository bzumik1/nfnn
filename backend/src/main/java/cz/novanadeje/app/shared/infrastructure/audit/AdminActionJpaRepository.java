package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.audit.AdminActionSummary;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface AdminActionJpaRepository extends JpaRepository<AdminActionJpaEntity, UUID> {

    List<AdminActionJpaEntity> findByPerformedAtLessThanOrderByPerformedAtDescIdDesc(Instant before, Limit limit);

    @Query(value = """
            select * from admin_action
            where (performed_at, id) < (:before, :beforeId)
            order by performed_at desc, id desc
            limit :limit""", nativeQuery = true)
    List<AdminActionJpaEntity> findPerformedBefore(@Param("before") Instant before, @Param("beforeId") UUID beforeId, @Param("limit") int limit);

    List<AdminActionJpaEntity> findByActionInOrderByPerformedAtAscIdAsc(Collection<String> actions);

    List<SummaryRow> findAllSummariesByOrderByPerformedAtDescIdDesc();

    long countByAdminIdAndActionAndPerformedAtGreaterThanEqual(UUID adminId, String action, Instant since);

    interface SummaryRow {

        UUID getId();

        UUID getAdminId();

        String getAction();

        UUID getSubjectId();

        Instant getPerformedAt();

        String getClient();

        default AdminActionSummary toSummary() {
            return new AdminActionSummary(getId(), getAdminId(), getAction(), Optional.ofNullable(getSubjectId()), getPerformedAt(),
                    Optional.ofNullable(getClient()));
        }
    }
}
