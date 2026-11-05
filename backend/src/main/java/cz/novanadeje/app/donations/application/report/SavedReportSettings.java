package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportSettings;

import java.time.Instant;

public record SavedReportSettings(ReportSettings settings, Instant changedAt, String version) {
}
