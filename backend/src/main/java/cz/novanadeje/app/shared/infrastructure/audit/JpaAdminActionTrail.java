package cz.novanadeje.app.shared.infrastructure.audit;

import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Component
class JpaAdminActionTrail implements AdminActionTrail {

    private final AdminActionJpaRepository actions;

    JpaAdminActionTrail(AdminActionJpaRepository actions) {
        this.actions = actions;
    }

    @Override
    public List<AdminActionEntry> findPerformedBefore(Instant before, int limit) {
        return actions.findByPerformedAtLessThanOrderByPerformedAtDescIdDesc(before, Limit.of(limit)).stream()
                .map(AdminActionJpaEntity::toEntry)
                .toList();
    }

    @Override
    public long countPerformedSince(UUID adminId, String action, Instant since) {
        return actions.countByAdminIdAndActionAndPerformedAtGreaterThanEqual(adminId, action, since);
    }
}
