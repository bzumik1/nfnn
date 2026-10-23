package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.ManualReportDelivery;
import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.DateTimeException;
import java.time.YearMonth;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/report")
class AdminReportController {

    private final ReportSettingsService settings;
    private final MonthlyReportService reports;

    AdminReportController(ReportSettingsService settings, MonthlyReportService reports) {
        this.settings = settings;
        this.reports = reports;
    }

    @GetMapping
    AdminReportResponse report() {
        ReportAdministrationView view = settings.view();
        return AdminReportResponse.from(view);
    }

    @PutMapping("/settings")
    AdminReportResponse.Settings changeSettings(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReportSettingsRequest request) {
        ReportSettings changed = settings.change(admin(jwt), new ReportSettings(ReportRecipients.parse(request.recipients()), request.sendDay(),
                new ReportSections(request.sections().donors(), request.sections().donations(), request.sections().unpairedPayments(),
                        request.sections().bankImport())));
        return AdminReportResponse.Settings.from(changed, settings.view().changedAt());
    }

    @PostMapping("/send")
    SendReportResponse send(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SendReportRequest request) {
        ManualReportDelivery delivery = reports.resend(admin(jwt), parseMonth(request.month()));
        return new SendReportResponse(delivery.month().toString(), delivery.recipients().values(), delivery.sentAt());
    }

    private static ReportMonth parseMonth(String month) {
        try {
            return new ReportMonth(YearMonth.parse(month));
        } catch (DateTimeException invalid) {
            throw new IllegalArgumentException("The month is written as YYYY-MM, not '" + month + "'");
        }
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
