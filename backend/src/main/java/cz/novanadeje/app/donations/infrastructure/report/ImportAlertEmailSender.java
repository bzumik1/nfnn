package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.event.BankImportOutageDetected;
import cz.novanadeje.app.donations.application.event.BankImportRecovered;
import cz.novanadeje.app.donations.domain.importing.ImportOutage;
import cz.novanadeje.app.donations.domain.importing.ImportRecovery;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.infrastructure.report.MonthlyReportFormats.CZECH;

@Component
class ImportAlertEmailSender {

    private static final Logger log = LoggerFactory.getLogger(ImportAlertEmailSender.class);
    private static final String KEYS = "donations.importAlert.email.";
    private static final String OUTAGE_TEMPLATE = "email/donations/import-outage";
    private static final String RECOVERY_TEMPLATE = "email/donations/import-recovered";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final ReportSettingsRepository settings;

    ImportAlertEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, ReportSettingsRepository settings) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.settings = settings;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendOutage(BankImportOutageDetected event) {
        ImportOutage outage = event.outage();
        String kind = outage.kind().name();
        String intro = outage.tokenRejected()
                ? text("outage.intro.token", MonthlyReportFormats.time(outage.detectedAt()))
                : text("outage.intro.repeated", outage.consecutiveFailures(), MonthlyReportFormats.time(outage.detectedAt()));
        String reason = text("outage.reason." + kind);
        String action = text("outage.action." + kind);
        String lastSuccess = lastSuccess("outage", outage.lastSucceededAt());
        String consequence = text("outage.consequence");
        String next = text("outage.next");
        String footer = text("footer");
        String plainText = paragraphs(text("greeting"), intro, reason, action, lastSuccess, consequence, next, text("signature"), footer);
        send("outage " + kind, new EmailDraft(CZECH, settings.current().recipients().values(), text("outage.subject"), text("outage.title"), OUTAGE_TEMPLATE,
                Map.of("intro", intro, "reason", reason, "action", action, "lastSuccess", lastSuccess, "consequence", consequence, "next", next),
                plainText, footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRecovery(BankImportRecovered event) {
        ImportRecovery recovery = event.recovery();
        String intro = text("recovery.intro", MonthlyReportFormats.time(recovery.recoveredAt()), recovery.failures());
        String lastSuccess = lastSuccess("recovery", recovery.lastSucceededBefore());
        String caughtUp = text("recovery.caughtUp");
        String footer = text("footer");
        String plainText = paragraphs(text("greeting"), intro, lastSuccess, caughtUp, text("signature"), footer);
        send("recovery from " + recovery.outageKind(), new EmailDraft(CZECH, settings.current().recipients().values(), text("recovery.subject"),
                text("recovery.title"), RECOVERY_TEMPLATE, Map.of("intro", intro, "lastSuccess", lastSuccess, "caughtUp", caughtUp),
                plainText, footer));
    }

    private String lastSuccess(String prefix, Optional<Instant> lastSucceededAt) {
        return lastSucceededAt
                .map(at -> text(prefix + ".lastSuccess", MonthlyReportFormats.time(at)))
                .orElseGet(() -> text(prefix + ".neverSucceeded"));
    }

    private void send(String alert, EmailDraft draft) {
        try {
            mailSender.send(emails.compose(draft));
            log.info("Fio import alert e-mail sent: {}", alert);
        } catch (MailException e) {
            log.error("The Fio import alert e-mail ({}) could not be sent: {}", alert, e.getClass().getSimpleName());
        }
    }

    private static String paragraphs(String... texts) {
        return String.join("\n\n", List.of(texts)) + "\n";
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, CZECH);
    }
}
