package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorReset;
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
import jakarta.mail.internet.InternetAddress;
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

import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorSecondFactorResetEmailSenderTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final String SENDER = "info@nfnn.cz";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(DonorSecondFactorResetEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when the reset notice is sent, then it goes to the donor from the foundation and says what happened and what to do")
    void should_tell_donor_in_czech_when_notice_sent_given_czech_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendResetNotice(new DonorSecondFactorReset(DONOR_ID, EMAIL, LocaleCode.CS));

            assertThat(recording.sent()).hasSize(1);
            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            InternetAddress from = (InternetAddress) email.getFrom()[0];
            assertThat(from.getAddress()).isEqualTo(SENDER);
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getSubject()).isEqualTo("Dvoufaktorové ověření vašeho účtu bylo vypnuto – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    správce fondu právě vypnul dvoufaktorové ověření vašeho dárcovského účtu Nová naděje, nejspíš na vaši žádost po ztrátě telefonu. Od teď se přihlásíte jen heslem; všechna dosavadní přihlášení jsme ukončili.

                    Dvoufaktorové ověření si můžete po přihlášení znovu zapnout na kartě Přihlašovací údaje.

                    Pokud jste o vypnutí nežádali, napište nám prosím co nejdříve na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains(">Dvoufaktorové ověření bylo vypnuto</h1>")
                    .contains("napište nám prosím co nejdříve na info@nfnn.cz")
                    .contains("src=\"cid:logo\"");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("second-factor-reset", email);
        });
    }

    @Test
    @DisplayName("Given an English donor, when the reset notice is sent, then subject and texts are English")
    void should_write_english_when_notice_sent_given_english_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendResetNotice(new DonorSecondFactorReset(DONOR_ID, EMAIL, LocaleCode.EN));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("Two-factor authentication of your account was turned off – Nová naděje");
            assertThat(MailContents.plainText(email))
                    .startsWith("Hello,")
                    .contains("an administrator of the foundation just turned off the two-factor authentication")
                    .contains("write to us as soon as possible at info@nfnn.cz");
            assertThat(MailContents.html(email)).contains("lang=\"en\"").contains(">Two-factor authentication turned off</h1>");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the notice is sent, then one ERROR line names the donor and the exception class, never the address")
    void should_log_donor_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context).sendResetNotice(new DonorSecondFactorReset(DONOR_ID, EMAIL, LocaleCode.CS));

            assertThat(logged.list).hasSize(1);
            ILoggingEvent line = logged.list.getFirst();
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage())
                    .contains(DONOR_ID.toString())
                    .contains("MailSendException")
                    .doesNotContain("example.cz");
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    private static DonorSecondFactorResetEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new DonorSecondFactorResetEmailSender(mailSender, emails, context.getBean(MessageSource.class), sender);
    }
}
