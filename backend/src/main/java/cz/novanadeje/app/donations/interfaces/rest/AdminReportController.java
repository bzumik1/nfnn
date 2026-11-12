package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.AdministrationChannel;
import cz.novanadeje.app.donations.application.report.ManualReportDelivery;
import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.application.report.SavedReportSettings;
import cz.novanadeje.app.donations.application.report.SentReportService;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/report")
class AdminReportController {

    private static final String SCOPE_CLAIM = "scope";

    private final ReportSettingsService settings;
    private final MonthlyReportService reports;
    private final SentReportService sentReports;
    private final ReportSendRateLimiter sendRateLimiter;

    AdminReportController(ReportSettingsService settings, MonthlyReportService reports, SentReportService sentReports,
                          ReportSendRateLimiter sendRateLimiter) {
        this.settings = settings;
        this.reports = reports;
        this.sentReports = sentReports;
        this.sendRateLimiter = sendRateLimiter;
    }

    @GetMapping
    AdminReportResponse report() {
        ReportAdministrationView view = settings.view();
        return AdminReportResponse.from(view);
    }

    @GetMapping("/sent")
    SentReportResponse sentReport(@RequestParam YearMonth month) {
        return SentReportResponse.from(sentReports.view(new ReportMonth(month)));
    }

    @PutMapping("/settings")
    AdminReportResponse.Settings changeSettings(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReportSettingsRequest request,
                                                ExpectedVersion expected) {
        SavedReportSettings saved = settings.change(admin(jwt), channel(jwt), new ReportSettings(ReportRecipients.parse(request.recipients()), request.sendDay(), request.sendHour(),
                new ReportSections(request.sections().donors(), request.sections().donations(), request.sections().unpairedPayments(),
                        request.sections().bankImport())), expected);
        return AdminReportResponse.Settings.from(saved.settings(), Optional.of(saved.changedAt()), saved.version());
    }

    @PostMapping("/send")
    SendReportResponse send(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SendReportRequest request) {
        sendRateLimiter.check(jwt.getSubject());
        ManualReportDelivery delivery = reports.resend(admin(jwt), parseMonth(request.month()));
        return new SendReportResponse(delivery.month().toString(), delivery.recipients().values(), delivery.sentAt());
    }

    private static ReportMonth parseMonth(String month) {
        return new ReportMonth(YearMonth.parse(month));
    }

    private static AdministrationChannel channel(Jwt jwt) {
        return jwt.hasClaim(SCOPE_CLAIM) ? AdministrationChannel.CONNECTED_APPLICATION : AdministrationChannel.BROWSER;
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
