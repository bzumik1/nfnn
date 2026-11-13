package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.application.event.BackupProblemsDetected;
import cz.novanadeje.app.operations.application.event.BackupRecovered;
import cz.novanadeje.app.operations.domain.backup.BackupHealth;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import cz.novanadeje.app.shared.application.notification.AlertRecipients;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.ObservedMailSenders;
import cz.novanadeje.app.support.RecordingMailSender;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.MessageSourceAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.thymeleaf.autoconfigure.ThymeleafAutoConfiguration;
import org.springframework.context.MessageSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.ITemplateEngine;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class BackupAlertEmailSenderTest {

    private static final Instant CHECKED_AT = Instant.parse("2026-10-23T10:00:00Z");
    private static final AlertRecipients RECIPIENTS = () -> List.of("info@nfnn.cz");
    private static final BackupRun FAILED_BACKUP = run(RunOutcome.FAILED, Instant.parse("2026-10-23T01:00:01Z"), Optional.of("nfnn-2026-10-23_0300.dump.age"),
            Optional.empty(), Optional.empty(), Optional.of("pg_dump: error: connection to server failed"));
    private static final BackupRun FAILED_TEST_RESTORE = run(RunOutcome.FAILED, Instant.parse("2026-10-18T02:10:00Z"),
            Optional.of("nfnn-2026-10-18_0300.dump.age"), Optional.empty(), Optional.empty(), Optional.empty());
    private static final BackupRun BACKUP = run(RunOutcome.OK, Instant.parse("2026-10-23T05:00:02Z"), Optional.of("nfnn-2026-10-23_0700.dump.age"),
            Optional.of(2_500_000L), Optional.empty(), Optional.empty());
    private static final BackupRun TEST_RESTORE = run(RunOutcome.OK, Instant.parse("2026-10-23T06:00:00Z"), Optional.of("nfnn-2026-10-23_0700.dump.age"),
            Optional.empty(), Optional.of(42), Optional.empty());

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    @Test
    @DisplayName("Given a failed backup and a failed test restore, when the problems are reported, then the e-mail names each with its run")
    void should_describe_each_problem_with_its_run_when_problems_reported_given_failed_backup_and_test_restore() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendProblems(new BackupProblemsDetected(Set.of(BackupProblem.TEST_RESTORE_FAILED, BackupProblem.BACKUP_FAILED),
                    view(FAILED_BACKUP, FAILED_TEST_RESTORE), CHECKED_AT));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("info@nfnn.cz");
            assertThat(email.getSubject()).isEqualTo("Zálohování databáze má problém – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    denní kontrola 23. 10. 2026 12:00 zjistila, že zálohování databáze webu Nová naděje nefunguje, jak má:

                    - Poslední záloha 23. 10. 2026 3:00 selhala: pg_dump: error: connection to server failed

                    - Zkušební obnova zálohy nfnn-2026-10-18_0300.dump.age z 18. 10. 2026 4:10 selhala: bez bližší chyby, podrobnosti jsou v logu kontejneru nfnn-backup. Záloha může být nepoužitelná.

                    Dokud problém trvá, může fond při poruše serveru ztratit data o darech a dárcích.

                    Stav záloh je ve správě webu na stránce Zálohy, kde zálohu i zkušební obnovu spustíte hned; podrobnosti jsou v logu kontejneru nfnn-backup (sudo docker logs nfnn-backup).

                    Až bude zálohování zase v pořádku, pošleme ještě jednu zprávu; do té doby už tuto zprávu neopakujeme.

                    Nová naděje – nadační fond

                    Tuto zprávu posílá web automaticky, když denní kontrola najde problém se zálohami databáze nebo jejich zkušební obnovou, a znovu, až problém skončí.
                    """);
            assertThat(MailContents.html(email)).contains("Zkušební obnova zálohy nfnn-2026-10-18_0300.dump.age z 18. 10. 2026 4:10 selhala");
        });
    }

    @Test
    @DisplayName("Given a backup and a test restore since, when the recovery is reported, then the e-mail names what ended and both last runs")
    void should_name_ended_problems_and_last_runs_when_recovery_reported_given_backup_and_test_restore() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRecovery(new BackupRecovered(Set.of(BackupProblem.TEST_RESTORE_STALE, BackupProblem.BACKUP_FAILED),
                    view(BACKUP, TEST_RESTORE), CHECKED_AT));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("Zálohování databáze zase funguje – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    denní kontrola 23. 10. 2026 12:00 našla zálohování databáze webu Nová naděje zase v pořádku.

                    Skončilo: selhání zálohy, zastaralá zkušební obnova.

                    Poslední záloha: nfnn-2026-10-23_0700.dump.age z 23. 10. 2026 7:00 (2,4 MB).

                    Poslední zkušební obnova: 23. 10. 2026 8:00, 42 tabulek.

                    Nová naděje – nadační fond

                    Tuto zprávu posílá web automaticky, když denní kontrola najde problém se zálohami databáze nebo jejich zkušební obnovou, a znovu, až problém skončí.
                    """);
            assertThat(MailContents.html(email)).contains("Poslední zkušební obnova: 23. 10. 2026 8:00, 42 tabulek.");
        });
    }

    private static BackupAdministrationView view(BackupRun lastBackup, BackupRun lastTestRestore) {
        return new BackupAdministrationView(true, List.of(), Optional.of(lastBackup), Optional.of(lastTestRestore), Optional.empty(), List.of(), 0, false,
                BackupHealth.unavailable());
    }

    private static BackupRun run(RunOutcome outcome, Instant finishedAt, Optional<String> fileName, Optional<Long> sizeBytes, Optional<Integer> tables,
                                 Optional<String> error) {
        return new BackupRun(outcome, finishedAt.minusSeconds(60), finishedAt, fileName, sizeBytes, tables, Optional.empty(), Optional.empty(), error,
                Optional.empty(), Optional.empty());
    }

    private BackupAlertEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MessageSource messages = context.getBean(MessageSource.class);
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), messages, new MailSenderProperties("info@nfnn.cz"),
                new PublicUrlProperties("http://localhost:4200/"));
        return new BackupAlertEmailSender(ObservedMailSenders.of(mailSender), emails, messages, RECIPIENTS);
    }
}
