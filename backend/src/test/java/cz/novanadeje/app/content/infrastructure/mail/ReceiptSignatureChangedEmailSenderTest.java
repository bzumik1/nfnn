package cz.novanadeje.app.content.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.content.application.event.ReceiptSignatureChanged;
import cz.novanadeje.app.shared.application.account.AdministratorContact;
import cz.novanadeje.app.shared.application.account.AdministratorContacts;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MailPreviews;
import cz.novanadeje.app.support.ObservedMailSenders;
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
import java.util.Optional;
import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReceiptSignatureChangedEmailSenderTest {

    private static final Instant CHANGED_AT = Instant.parse("2026-11-12T09:05:00Z");
    private static final UUID JANA = UUID.fromString("019a3a00-0000-7000-8000-00000000a001");
    private static final UUID PETR = UUID.fromString("019a3a00-0000-7000-8000-00000000a002");
    private static final UUID PERSON = UUID.fromString("019a3a00-0000-7000-8000-00000000f001");
    private static final AdministratorContact JANA_CONTACT = new AdministratorContact(JANA, new EmailAddress("jana@example.cz"), LocaleCode.CS);
    private static final AdministratorContact PETR_CONTACT = new AdministratorContact(PETR, new EmailAddress("petr@example.cz"), LocaleCode.EN);
    private static final String SENDER = "info@nfnn.cz";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));
    private final AdministratorContacts administrators = mock(AdministratorContacts.class);

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(ReceiptSignatureChangedEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
        when(administrators.all()).thenReturn(List.of(JANA_CONTACT, PETR_CONTACT));
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given two administrators, when a connection sets the signature of the person who signs the receipts, then each gets a notice in their language that names who changed whose signature, when and through which connection")
    void should_tell_every_administrator_when_changed_given_two_administrators_and_a_connection() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendChangedNotice(new ReceiptSignatureChanged(JANA, Optional.of("claude.ai"), PERSON, "Josef Vzorový", false, CHANGED_AT));

            assertThat(recording.sent()).hasSize(2);
            MimeMessage czech = MailContents.asReceived(recording.sent().getFirst());
            assertThat(czech.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(czech.getSubject()).isEqualTo("Podpis na potvrzeních o daru se změnil – Nová naděje");
            assertThat(MailContents.plainText(czech).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    správce jana@example.cz 12. 11. 2026 v 10:05 změnil ve správě webu Nová naděje podpis osoby Josef Vzorový, která podepisuje potvrzení o daru. Potvrzení vydaná od teď ponesou nový podpis, už vystavená potvrzení se nemění.

                    Změnu udělala připojená aplikace claude.ai.

                    Pokud o tom víte, nemusíte nic dělat.

                    Pokud ne, podívejte se ve správě na Lidi fondu a do Historie změn, změňte si prosím hned heslo i druhý faktor a napište ostatním správcům a na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(czech))
                    .contains("lang=\"cs\"")
                    .contains(">Podpis na potvrzeních o daru se změnil</h1>")
                    .contains("podpis osoby Josef Vzorový, která podepisuje potvrzení o daru")
                    .contains("Změnu udělala připojená aplikace claude.ai.");
            MimeMessage english = MailContents.asReceived(recording.sent().get(1));
            assertThat(english.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("petr@example.cz");
            assertThat(english.getSubject()).isEqualTo("The signature on donation receipts changed – Nová naděje");
            assertThat(MailContents.plainText(english))
                    .startsWith("Hello,")
                    .contains("the administrator jana@example.cz changed the signature of Josef Vzorový, who signs the donation receipts,"
                            + " in the administration of the Nová naděje site on 12 Nov 2026 at 10:05")
                    .contains("The connected application claude.ai made the change.");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("receipt-signature-changed", czech);
        });
    }

    @Test
    @DisplayName("Given the administrator who removed the signature is no longer one and no connection took part, when the notice goes out, then it names no address and no connection and says the receipts carry the line only")
    void should_name_no_address_when_removed_given_administrator_gone() {
        when(administrators.all()).thenReturn(List.of(PETR_CONTACT));
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendChangedNotice(new ReceiptSignatureChanged(JANA, Optional.empty(), PERSON, "Josef Vzorový", true, CHANGED_AT));

            String english = MailContents.plainText(MailContents.asReceived(recording.sent().getFirst()));
            assertThat(english)
                    .contains("an administrator removed the signature of Josef Vzorový, who signs the donation receipts,")
                    .contains("Receipts issued from now on carry only the line under the name")
                    .doesNotContain("jana@example.cz")
                    .doesNotContain("connected application");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the notice is sent, then one ERROR line per administrator names the id and the exception class, never the address or the name")
    void should_log_id_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context).sendChangedNotice(new ReceiptSignatureChanged(JANA, Optional.empty(), PERSON, "Josef Vzorový", false, CHANGED_AT));

            assertThat(logged.list).hasSize(2).allSatisfy(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).contains("MailSendException").doesNotContain("example.cz").doesNotContain("Josef");
                assertThat(line.getThrowableProxy()).isNull();
            });
            assertThat(logged.list.getFirst().getFormattedMessage())
                    .isEqualTo("The notice of the changed receipt signature for admin " + JANA + " could not be sent: MailSendException");
        });
    }

    @Test
    @DisplayName("Given the administrators cannot be read, when the notices are prepared, then the failure is logged with the admin id and the exception class only")
    void should_log_when_prepared_given_unreadable_administrators() {
        when(administrators.all()).thenThrow(new IllegalStateException("database gone"));
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendChangedNotice(new ReceiptSignatureChanged(JANA, Optional.empty(), PERSON, "Josef Vzorový", false, CHANGED_AT));

            assertThat(recording.sent()).isEmpty();
            assertThat(logged.list).singleElement().satisfies(line -> assertThat(line.getFormattedMessage())
                    .isEqualTo("The notices that admin " + JANA + " changed the receipt signature could not be prepared: IllegalStateException"));
        });
    }

    private ReceiptSignatureChangedEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new ReceiptSignatureChangedEmailSender(ObservedMailSenders.of(mailSender), emails, context.getBean(MessageSource.class), sender, administrators);
    }
}
