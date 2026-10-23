package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.SentReport;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public record AdminReportResponse(Settings settings, List<Sent> sentReports, Next nextReport, String lastEndedMonth) {

    public record Settings(List<String> recipients, int sendDay, int sendHour, Sections sections, Instant changedAt) {

        static Settings from(ReportSettings settings, Optional<Instant> changedAt) {
            return new Settings(settings.recipients().values(), settings.sendDay(), settings.sendHour(),
                    new Sections(settings.sections().donors(), settings.sections().donations(), settings.sections().unpairedPayments(),
                            settings.sections().bankImport()),
                    changedAt.orElse(null));
        }
    }

    public record Sections(boolean donors, boolean donations, boolean unpairedPayments, boolean bankImport) {
    }

    public record Sent(String month, Instant sentAt) {

        static Sent from(SentReport report) {
            return new Sent(report.month().toString(), report.sentAt());
        }
    }

    public record Next(String month, LocalDate dueOn) {
    }

    static AdminReportResponse from(ReportAdministrationView view) {
        return new AdminReportResponse(Settings.from(view.settings(), view.changedAt()),
                view.sentReports().stream().map(Sent::from).toList(),
                new Next(view.nextReport().month().toString(), view.nextReport().dueOn()), view.lastEndedMonth().toString());
    }
}
