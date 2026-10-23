package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.event.DonorAccountErased;
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

class DonorAccountErasedEmailSenderTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final EmailAddress FORMER_EMAIL = new EmailAddress("petr@example.cz");
    private static final String SENDER = "info@nfnn.cz";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(DonorAccountErasedEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when the erasure notice is sent, then it goes to the former address from the foundation and says what was erased, what is kept and how to come back")
    void should_tell_donor_in_czech_when_notice_sent_given_czech_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendErasureNotice(new DonorAccountErased(DONOR_ID, FORMER_EMAIL, LocaleCode.CS));

            assertThat(recording.sent()).hasSize(1);
            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            InternetAddress from = (InternetAddress) email.getFrom()[0];
            assertThat(from.getAddress()).isEqualTo(SENDER);
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("petr@example.cz");
            assertThat(email.getSubject()).isEqualTo("Vaše osobní údaje jsme vymazali – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    na vaši žádost jsme vymazali osobní údaje z vašeho dárcovského účtu Nová naděje: jméno, adresu, e-mail, heslo a bankovní účty. Účet už nejde použít a všechna přihlášení jsme ukončili.

                    Záznamy o přijatých darech a vydaná potvrzení o daru musíme podle účetních předpisů uchovat; nejsou už ale spojené s vaším jménem.

                    Kdybyste se k nám chtěli někdy vrátit, stačí se znovu zaregistrovat. Děkujeme za vaši podporu.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains(">Osobní údaje vymazány</h1>")
                    .contains("stačí se znovu zaregistrovat")
                    .contains("src=\"cid:logo\"");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("account-erased", email);
        });
    }

    @Test
    @DisplayName("Given an English donor, when the erasure notice is sent, then subject and texts are English")
    void should_write_english_when_notice_sent_given_english_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendErasureNotice(new DonorAccountErased(DONOR_ID, FORMER_EMAIL, LocaleCode.EN));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("Your personal data has been erased – Nová naděje");
            assertThat(MailContents.plainText(email))
                    .startsWith("Hello,")
                    .contains("we have erased the personal data of your Nová naděje donor account")
                    .contains("simply register again");
            assertThat(MailContents.html(email)).contains("lang=\"en\"").contains(">Personal data erased</h1>");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the notice is sent, then one ERROR line names the donor and the exception class, never the address")
    void should_log_donor_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 petr@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context).sendErasureNotice(new DonorAccountErased(DONOR_ID, FORMER_EMAIL, LocaleCode.CS));

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

    private static DonorAccountErasedEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new DonorAccountErasedEmailSender(mailSender, emails, context.getBean(MessageSource.class), sender);
    }
}
