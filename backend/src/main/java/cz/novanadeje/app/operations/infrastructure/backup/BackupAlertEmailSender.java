package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.application.event.BackupProblemsDetected;
import cz.novanadeje.app.operations.application.event.BackupRecovered;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.shared.application.notification.AlertRecipients;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.operations.infrastructure.backup.BackupFormats.CZECH;

@Component
class BackupAlertEmailSender {

    private static final Logger log = LoggerFactory.getLogger(BackupAlertEmailSender.class);
    private static final String KEYS = "operations.backupAlert.email.";
    private static final String PROBLEM_TEMPLATE = "email/operations/backup-problem";
    private static final String RECOVERY_TEMPLATE = "email/operations/backup-recovered";

    private final JavaMailSender mailSender;
    private final BrandedEmails emails;
    private final MessageSource messages;
    private final AlertRecipients recipients;

    BackupAlertEmailSender(JavaMailSender mailSender, BrandedEmails emails, MessageSource messages, AlertRecipients recipients) {
        this.mailSender = mailSender;
        this.emails = emails;
        this.messages = messages;
        this.recipients = recipients;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendProblems(BackupProblemsDetected event) {
        String intro = text("problem.intro", BackupFormats.time(event.detectedAt()));
        List<String> problems = describe(event.problems(), event.view());
        String consequence = text("problem.consequence");
        String action = text("problem.action");
        String next = text("problem.next");
        String footer = text("footer");
        List<String> paragraphs = new ArrayList<>(List.of(text("greeting"), intro));
        paragraphs.addAll(problems.stream().map(problem -> "- " + problem).toList());
        paragraphs.addAll(List.of(consequence, action, next, text("signature"), footer));
        send("problems " + event.problems(), new EmailDraft(CZECH, recipients.emailAddresses(), text("problem.subject"), text("problem.title"),
                PROBLEM_TEMPLATE, Map.of("intro", intro, "problems", problems, "consequence", consequence, "action", action, "next", next),
                paragraphs(paragraphs), footer));
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendRecovery(BackupRecovered event) {
        String intro = text("recovery.intro", BackupFormats.time(event.recoveredAt()));
        String resolved = text("recovery.resolved", String.join(", ", event.resolvedProblems().stream().sorted().map(this::label).toList()));
        String lastBackup = event.view().lastBackup()
                .map(run -> text("recovery.lastBackup", run.fileName().orElse("?"), BackupFormats.time(run.finishedAt()),
                        BackupFormats.size(run.sizeBytes().orElse(0L))))
                .orElseGet(() -> text("recovery.noBackup"));
        String lastTest = event.view().lastTestRestore()
                .map(run -> text("recovery.lastTestRestore", BackupFormats.time(run.finishedAt()), run.tables().orElse(0)))
                .orElseGet(() -> text("recovery.noTestRestore"));
        String footer = text("footer");
        send("recovery from " + event.resolvedProblems(), new EmailDraft(CZECH, recipients.emailAddresses(), text("recovery.subject"),
                text("recovery.title"), RECOVERY_TEMPLATE,
                Map.of("intro", intro, "resolved", resolved, "lastBackup", lastBackup, "lastTestRestore", lastTest),
                paragraphs(List.of(text("greeting"), intro, resolved, lastBackup, lastTest, text("signature"), footer)), footer));
    }

    private List<String> describe(Set<BackupProblem> problems, BackupAdministrationView view) {
        return problems.stream().sorted().map(problem -> describe(problem, view)).toList();
    }

    private String describe(BackupProblem problem, BackupAdministrationView view) {
        Optional<BackupRun> backup = view.lastBackup();
        Optional<BackupRun> test = view.lastTestRestore();
        return switch (problem) {
            case BACKUPS_UNAVAILABLE, BACKUP_MISSING, TEST_RESTORE_MISSING -> text("problem." + problem.name());
            case BACKUP_FAILED -> text("problem.BACKUP_FAILED", BackupFormats.time(finishedAt(backup)), error(backup));
            case BACKUP_STALE -> text("problem.BACKUP_STALE", BackupFormats.time(finishedAt(backup)));
            case TEST_RESTORE_FAILED -> text("problem.TEST_RESTORE_FAILED", test.flatMap(BackupRun::fileName).orElse("?"),
                    BackupFormats.time(finishedAt(test)), error(test));
            case TEST_RESTORE_STALE -> text("problem.TEST_RESTORE_STALE", BackupFormats.time(finishedAt(test)));
        };
    }

    private String label(BackupProblem problem) {
        return text("label." + problem.name());
    }

    private static Instant finishedAt(Optional<BackupRun> run) {
        return run.map(BackupRun::finishedAt).orElse(Instant.EPOCH);
    }

    private String error(Optional<BackupRun> run) {
        return run.flatMap(BackupRun::error).orElseGet(() -> text("problem.noErrorText"));
    }

    private void send(String alert, EmailDraft draft) {
        try {
            mailSender.send(emails.compose(draft));
            log.info("Backup alert e-mail sent: {}", alert);
        } catch (MailException e) {
            log.error("The backup alert e-mail ({}) could not be sent: {}", alert, e.getClass().getSimpleName());
        }
    }

    private static String paragraphs(List<String> texts) {
        return String.join("\n\n", texts) + "\n";
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, CZECH);
    }
}
