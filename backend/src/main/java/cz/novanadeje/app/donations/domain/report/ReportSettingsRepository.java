package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;
import java.util.Optional;

public interface ReportSettingsRepository {

    ReportSettings current();

    Optional<Instant> lastChangedAt();

    void save(ReportSettings settings, Instant at);
}
