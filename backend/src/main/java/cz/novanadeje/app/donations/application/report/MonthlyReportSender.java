package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.MonthlyReport;

public interface MonthlyReportSender {

    void send(MonthlyReport report);
}
