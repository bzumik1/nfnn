package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.AdministratorContact;
import cz.novanadeje.app.donors.application.AdministratorService;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.application.event.BackupKeyRevealed;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MailPreviews;
import cz.novanadeje.app.support.RecordingMailSender;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.MessageSourceAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.thymeleaf.autoconfigure.ThymeleafAutoConfiguration;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.ITemplateEngine;

import java.time.Instant;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BackupKeyRevealedEmailSenderTest {

    private static final Instant REVEALED_AT = Instant.parse("2026-10-29T19:05:00Z");
    private static final DonorId JANA = DonorId.newId(REVEALED_AT.minusSeconds(3000));
    private static final DonorId PETR = DonorId.newId(REVEALED_AT.minusSeconds(2000));
    private static final AdministratorContact JANA_CONTACT = new AdministratorContact(JANA, new EmailAddress("jana@example.cz"), LocaleCode.CS);
    private static final AdministratorContact PETR_CONTACT = new AdministratorContact(PETR, new EmailAddress("petr@example.cz"), LocaleCode.EN);
    private static final String SENDER = "info@nfnn.cz";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));
    private final AdministratorService administrators = mock(AdministratorService.class);

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(BackupKeyRevealedEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
        when(administrators.contacts()).thenReturn(List.of(JANA_CONTACT, PETR_CONTACT));
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given two administrators, when the key is shown, then each gets a notice in their language that names who showed it and when")
    void should_tell_every_administrator_when_key_shown_given_two_administrators() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRevealedNotice(new BackupKeyRevealed(JANA.value(), REVEALED_AT));

            assertThat(recording.sent()).hasSize(2);
            MimeMessage czech = MailContents.asReceived(recording.sent().getFirst());
            assertThat(czech.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(czech.getSubject()).isEqualTo("Klíč k zálohám byl zobrazen – Nová naděje");
            assertThat(MailContents.plainText(czech).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    správce jana@example.cz si 29. 10. 2026 v 20:05 zobrazil ve správě webu Nová naděje klíč k zálohám. Kdo má klíč a zálohu, přečte všechna data webu, proto o každém zobrazení dáváme vědět všem správcům.

                    Pokud o tom víte, nemusíte nic dělat.

                    Pokud ne, změňte si prosím hned heslo i druhý faktor, ověřte v Historii změn ve správě, kdo se přihlásil, a napište ostatním správcům a na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(czech))
                    .contains("lang=\"cs\"")
                    .contains(">Klíč k zálohám byl zobrazen</h1>")
                    .contains("správce jana@example.cz si 29. 10. 2026 v 20:05 zobrazil")
                    .doesNotContain("AGE-SECRET-KEY");
            MimeMessage english = MailContents.asReceived(recording.sent().get(1));
            assertThat(english.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("petr@example.cz");
            assertThat(english.getSubject()).isEqualTo("The backup key was shown – Nová naděje");
            assertThat(MailContents.plainText(english))
                    .startsWith("Hello,")
                    .contains("the administrator jana@example.cz viewed the backup key in the administration of the Nová naděje site on 29 Oct 2026 at 20:05");
            assertThat(MailContents.html(english)).contains("lang=\"en\"");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("backup-key-revealed", czech);
        });
    }

    @Test
    @DisplayName("Given the administrator who showed the key is no longer one, when the notice goes out, then it names no address")
    void should_name_no_address_when_key_shown_given_revealing_administrator_gone() {
        when(administrators.contacts()).thenReturn(List.of(PETR_CONTACT));
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRevealedNotice(new BackupKeyRevealed(JANA.value(), REVEALED_AT));

            MimeMessage english = MailContents.asReceived(recording.sent().getFirst());
            assertThat(MailContents.plainText(english)).contains("an administrator viewed the backup key").doesNotContain("jana@example.cz");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the notice is sent, then one ERROR line per administrator names the id and the exception class, never the address")
    void should_log_id_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context).sendRevealedNotice(new BackupKeyRevealed(JANA.value(), REVEALED_AT));

            assertThat(logged.list).hasSize(2).allSatisfy(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).contains("MailSendException").doesNotContain("example.cz");
                assertThat(line.getThrowableProxy()).isNull();
            });
            assertThat(logged.list.getFirst().getFormattedMessage()).contains(JANA.value().toString());
            assertThat(logged.list.get(1).getFormattedMessage()).contains(PETR.value().toString());
        });
    }

    private BackupKeyRevealedEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new BackupKeyRevealedEmailSender(mailSender, emails, context.getBean(MessageSource.class), sender, administrators);
    }
}
