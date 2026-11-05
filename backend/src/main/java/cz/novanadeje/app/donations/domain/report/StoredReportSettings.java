package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public record StoredReportSettings(ReportSettings settings, Optional<Instant> changedAt) {

    public StoredReportSettings {
        Objects.requireNonNull(settings, "settings");
        Objects.requireNonNull(changedAt, "changedAt");
    }
}
