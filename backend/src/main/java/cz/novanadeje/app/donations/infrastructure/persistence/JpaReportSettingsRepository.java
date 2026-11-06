package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.donations.infrastructure.report.MonthlyReportProperties;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaReportSettingsRepository implements ReportSettingsRepository {

    private final ReportSettingsJpaRepository jpa;
    private final MonthlyReportProperties defaults;
    private final EntityManager entityManager;

    JpaReportSettingsRepository(ReportSettingsJpaRepository jpa, MonthlyReportProperties defaults, EntityManager entityManager) {
        this.jpa = jpa;
        this.defaults = defaults;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForChange() {
        AdvisoryLock.REPORT_SETTINGS_CHANGES.acquireFor(entityManager);
    }

    @Override
    public ReportSettings current() {
        return jpa.findById(ReportSettingsJpaEntity.SINGLETON_ID)
                .map(ReportSettingsJpaEntity::toDomain)
                .orElseGet(() -> ReportSettings.defaults(new EmailAddress(defaults.recipient())));
    }

    @Override
    public Optional<Instant> lastChangedAt() {
        return jpa.findById(ReportSettingsJpaEntity.SINGLETON_ID).map(ReportSettingsJpaEntity::updatedAt);
    }

    @Override
    public void save(ReportSettings settings, Instant at) {
        jpa.save(ReportSettingsJpaEntity.fromDomain(settings, at));
    }
}
