package cz.novanadeje.app.shared.infrastructure.audit;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
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

    @Query("""
            select new cz.novanadeje.app.shared.infrastructure.audit.AdminActionSummaryRow(a.id, a.adminId, a.action, a.subjectId, a.performedAt, a.client)
            from AdminActionJpaEntity a
            order by a.performedAt desc, a.id desc""")
    List<AdminActionSummaryRow> findAllSummariesNewestFirst();

    long countByAdminIdAndActionAndPerformedAtGreaterThanEqual(UUID adminId, String action, Instant since);
}
