package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.application.report.MonthlyReportSender;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import java.io.UnsupportedEncodingException;
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
    private final ITemplateEngine templates;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final MonthlyReportProperties properties;

    MonthlyReportEmailSender(JavaMailSender mailSender, ITemplateEngine templates, MessageSource messages, MailSenderProperties sender,
                             MonthlyReportProperties properties) {
        this.mailSender = mailSender;
        this.templates = templates;
        this.messages = messages;
        this.sender = sender;
        this.properties = properties;
    }

    @Override
    public void send(MonthlyReport report) {
        try {
            String month = MonthlyReportFormats.month(report.month());
            List<ReportSection> sections = sections(report, month);
            MimeMessage email = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(email, true, "UTF-8");
            helper.setFrom(sender.senderEmail(), text("senderName"));
            helper.setTo(properties.recipient());
            helper.setSubject(text("subject", month));
            helper.setText(plainText(month, sections), html(month, sections));
            mailSender.send(email);
        } catch (MailException | MessagingException | UnsupportedEncodingException e) {
            throw new MonthlyReportNotDelivered(report.month(), e);
        }
    }

    private List<ReportSection> sections(MonthlyReport report, String month) {
        return List.of(
                new ReportSection(text("donors"), List.of(
                        text("donors.registered", MonthlyReportFormats.date(report.month().lastDay()),
                                MonthlyReportFormats.count(report.donors().registered())),
                        text("donors.new", month, MonthlyReportFormats.count(report.donors().newInMonth())))),
                new ReportSection(text("donations"), List.of(
                        tallyLine("donations.month", month, report.donationsInMonth()),
                        tallyLine("donations.year", MonthlyReportFormats.date(report.month().firstDayOfYear()), report.donationsInYear()))),
                new ReportSection(text("unpaired"), List.of(
                        tallyLine("unpaired.month", month, report.unpairedPaymentsInMonth()),
                        text("unpaired.hint"))),
                new ReportSection(text("bank"), bankLines(report.bankImport())));
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

    private String html(String month, List<ReportSection> sections) {
        Context context = new Context(CZECH, Map.of(
                "title", text("title", month),
                "greeting", text("greeting"),
                "intro", text("intro", month),
                "sections", sections,
                "footer", text("footer"),
                "signature", text("signature")
        ));
        return templates.process(TEMPLATE, context);
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, CZECH);
    }
}
