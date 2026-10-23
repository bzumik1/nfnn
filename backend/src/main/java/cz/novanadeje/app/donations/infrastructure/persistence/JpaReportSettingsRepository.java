package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.donations.infrastructure.report.MonthlyReportProperties;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
class JpaReportSettingsRepository implements ReportSettingsRepository {

    private final ReportSettingsJpaRepository jpa;
    private final MonthlyReportProperties defaults;

    JpaReportSettingsRepository(ReportSettingsJpaRepository jpa, MonthlyReportProperties defaults) {
        this.jpa = jpa;
        this.defaults = defaults;
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
