package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.event.AdministratorSecondFactorRecovered;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorRecovered;
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

import java.util.List;
import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorSecondFactorRecoveredEmailSenderTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final String SENDER = "info@nfnn.cz";
    private static final String ACCOUNT = "…5399/0800";

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(DonorSecondFactorRecoveredEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when the recovery notice is sent, then it goes to the donor and names the paying account, the outcome and what to do")
    void should_tell_the_donor_in_czech_when_the_notice_is_sent_given_a_czech_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRecoveryNotice(new DonorSecondFactorRecovered(DONOR_ID, EMAIL, LocaleCode.CS, ACCOUNT));

            assertThat(recording.sent()).hasSize(1);
            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(((InternetAddress) email.getFrom()[0]).getAddress()).isEqualTo(SENDER);
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getSubject()).isEqualTo("Dvoufaktorové ověření jsme vypnuli podle vaší platby – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    dorazila vaše platba 1 Kč z účtu …5399/0800 s kódem pro obnovu přístupu, a tak jsme vypnuli dvoufaktorové ověření vašeho dárcovského účtu Nová naděje. Od teď se přihlásíte jen heslem; všechna dosavadní přihlášení jsme ukončili.

                    Dvoufaktorové ověření si můžete po přihlášení znovu zapnout na kartě Přihlašovací údaje, třeba v novém telefonu.

                    Pokud jste tuto platbu neposílali, napište nám prosím co nejdříve na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains(">Dvoufaktorové ověření je vypnuté</h1>")
                    .contains("z účtu …5399/0800 s kódem")
                    .contains("src=\"cid:logo\"");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("second-factor-recovered", email);
        });
    }

    @Test
    @DisplayName("Given an English donor, when the recovery notice is sent, then subject and texts are English")
    void should_write_english_when_the_notice_is_sent_given_an_english_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRecoveryNotice(new DonorSecondFactorRecovered(DONOR_ID, EMAIL, LocaleCode.EN, ACCOUNT));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("Two-factor authentication turned off after your payment – Nová naděje");
            assertThat(MailContents.plainText(email)).startsWith("Hello,").contains("from the account …5399/0800 with the recovery code");
            assertThat(MailContents.html(email)).contains("lang=\"en\"").contains(">Two-factor authentication is off</h1>");
        });
    }

    @Test
    @DisplayName("Given two other administrators, when an administrator recovered by payment, then each gets a notice in their language naming the administrator and what to do")
    void should_tell_each_other_administrator_in_their_language_when_an_administrator_recovered() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).tellTheOtherAdministrators(new AdministratorSecondFactorRecovered(DONOR_ID, "Jana Nováková", EMAIL, ACCOUNT, List.of(
                    new AdministratorSecondFactorRecovered.Recipient(new EmailAddress("petr@example.cz"), LocaleCode.CS),
                    new AdministratorSecondFactorRecovered.Recipient(new EmailAddress("eva@example.cz"), LocaleCode.EN))));

            assertThat(recording.sent()).hasSize(2);
            MimeMessage czech = MailContents.asReceived(recording.sent().getFirst());
            assertThat(czech.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("petr@example.cz");
            assertThat(czech.getSubject()).isEqualTo("Na účtu správce se platbou 1 Kč vypnulo dvoufaktorové ověření – Nová naděje");
            assertThat(MailContents.plainText(czech).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    na účtu správce Jana Nováková (jana@example.cz) se platbou 1 Kč z ověřeného bankovního účtu …5399/0800 vypnulo dvoufaktorové ověření, nejspíš po ztrátě telefonu. Všechna přihlášení tohoto účtu skončila a správa se z něj otevře, až se na něm ověření znovu zapne.

                    Pokud o tom víte, nemusíte nic dělat; zápis je v Historii změn.

                    Pokud vám to nesedí, odeberte účtu roli správce na stránce Správci ve správě webu a ověřte to přímo u majitele účtu; s dotazem pište na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Tento e-mail dostávají ostatní správci webu Nová naděje.
                    """);
            assertThat(MailContents.html(czech)).contains(">Přístup správce obnovený platbou</h1>").contains("Jana Nováková (jana@example.cz)");
            MailPreviews.save("administrator-second-factor-recovered", czech);
            MimeMessage english = MailContents.asReceived(recording.sent().get(1));
            assertThat(english.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("eva@example.cz");
            assertThat(english.getSubject()).isEqualTo("An administrator turned off two-factor authentication with a CZK 1 payment – Nová naděje");
            assertThat(MailContents.html(english)).contains("lang=\"en\"").contains("the administrator Jana Nováková (jana@example.cz)");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the notices are sent, then each ERROR line names ids and the exception class, never an address")
    void should_log_ids_and_exception_class_only_when_sent_given_a_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            DonorSecondFactorRecoveredEmailSender sender = sender(context);
            sender.sendRecoveryNotice(new DonorSecondFactorRecovered(DONOR_ID, EMAIL, LocaleCode.CS, ACCOUNT));
            sender.tellTheOtherAdministrators(new AdministratorSecondFactorRecovered(DONOR_ID, "Jana Nováková", EMAIL, ACCOUNT, List.of(
                    new AdministratorSecondFactorRecovered.Recipient(new EmailAddress("petr@example.cz"), LocaleCode.CS))));

            assertThat(logged.list).hasSize(2).allSatisfy(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).contains(DONOR_ID.toString()).contains("MailSendException")
                        .doesNotContain("example.cz").doesNotContain("Nováková");
                assertThat(line.getThrowableProxy()).isNull();
            });
        });
    }

    private static DonorSecondFactorRecoveredEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new DonorSecondFactorRecoveredEmailSender(mailSender, emails, context.getBean(MessageSource.class), sender);
    }
}
