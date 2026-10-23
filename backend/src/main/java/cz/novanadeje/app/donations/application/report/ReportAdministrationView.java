package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.SentReport;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public record ReportAdministrationView(ReportSettings settings, Optional<Instant> changedAt, List<SentReport> sentReports, NextReport nextReport,
                                       ReportMonth lastEndedMonth) {

    public record NextReport(ReportMonth month, LocalDate dueOn) {
    }
}
