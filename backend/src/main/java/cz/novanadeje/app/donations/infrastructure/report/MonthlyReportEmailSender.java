package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.application.report.MonthlyReportSender;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static cz.novanadeje.app.donations.infrastructure.report.MonthlyReportFormats.CZECH;

@Component
class MonthlyReportEmailSender implements MonthlyReportSender {

    private static final String KEYS = "donations.monthlyReport.email.";
    private static final String TEMPLATE = "email/donations/monthly-report";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;

    MonthlyReportEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
    }

    @Override
    public void send(MonthlyReport report, ReportSettings settings) {
        try {
            String month = MonthlyReportFormats.month(report.month());
            List<ReportSection> sections = sections(report, month, settings.sections());
            mailSender.send(emails.compose(new EmailDraft(CZECH, settings.recipients().values(), text("subject", month), text("title", month), TEMPLATE,
                    Map.of("greeting", text("greeting"), "intro", text("intro", month), "sections", sections,
                            "regards", text("regards"), "signature", text("signature")),
                    plainText(month, sections), text("footer"))));
        } catch (MailException e) {
            throw new MonthlyReportNotDelivered(report.month(), e);
        }
    }

    private List<ReportSection> sections(MonthlyReport report, String month, ReportSections included) {
        List<ReportSection> sections = new ArrayList<>();
        if (included.donors()) {
            sections.add(new ReportSection(text("donors"), List.of(
                    text("donors.registered", MonthlyReportFormats.date(report.month().lastDay()),
                            MonthlyReportFormats.count(report.donors().registered())),
                    text("donors.new", month, MonthlyReportFormats.count(report.donors().newInMonth())))));
        }
        if (included.donations()) {
            sections.add(new ReportSection(text("donations"), List.of(
                    tallyLine("donations.month", month, report.receivedInMonth()),
                    tallyLine("donations.paired", month, report.pairedInMonth()),
                    tallyLine("donations.year", MonthlyReportFormats.date(report.month().firstDayOfYear()), report.receivedInYear()))));
        }
        if (included.unpairedPayments()) {
            sections.add(new ReportSection(text("unpaired"), List.of(
                    tallyLine("unpaired.month", month, report.unpairedInMonth()),
                    text("unpaired.hint"))));
        }
        if (included.bankImport()) {
            sections.add(new ReportSection(text("bank"), bankLines(report.bankImport())));
        }
        return List.copyOf(sections);
    }

    private List<String> bankLines(BankImportStatus status) {
        List<String> lines = new ArrayList<>();
        lines.add(status.lastSucceededAt()
                .map(at -> text("bank.lastSuccess", MonthlyReportFormats.time(at)))
                .orElseGet(() -> text("bank.neverSucceeded")));
        status.lastFailure().ifPresent(failure -> lines.add(text("bank.lastFailure", MonthlyReportFormats.time(failure.attemptedAt()),
                text("bank.failure." + failure.kind().name()))));
        return lines;
    }

    private String tallyLine(String key, String period, Tally tally) {
        return text(key, period, MonthlyReportFormats.count(tally.count()), MonthlyReportFormats.amount(tally.total()));
    }

    private String plainText(String month, List<ReportSection> sections) {
        List<String> paragraphs = new ArrayList<>();
        paragraphs.add(text("greeting"));
        paragraphs.add(text("intro", month));
        sections.forEach(section -> paragraphs.add(section.heading() + "\n" + String.join("\n", section.lines())));
        paragraphs.add(text("footer"));
        paragraphs.add(text("signature"));
        return paragraphs.stream().collect(Collectors.joining("\n\n", "", "\n"));
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, CZECH);
    }
}
