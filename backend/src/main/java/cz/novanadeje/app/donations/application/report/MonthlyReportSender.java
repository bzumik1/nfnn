package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportSettings;

public interface MonthlyReportSender {

    void send(MonthlyReport report, ReportSettings settings);
}
