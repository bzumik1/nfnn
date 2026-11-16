package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorRecoveryStarted;
import cz.novanadeje.app.donors.application.event.DonorSenderAccountLearned;
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

class DonorSecurityNoticeEmailSenderTest {

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
        senderLog = (Logger) LoggerFactory.getLogger(DonorSecurityNoticeEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when a recovery of the second factor starts, then the donor is told that only the payment changes anything and what to do if it was not them")
    void should_tell_the_donor_in_czech_when_a_recovery_starts_given_a_czech_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRecoveryStartedNotice(new DonorSecondFactorRecoveryStarted(DONOR_ID, EMAIL, LocaleCode.CS));

            assertThat(recording.sent()).hasSize(1);
            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(((InternetAddress) email.getFrom()[0]).getAddress()).isEqualTo(SENDER);
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getSubject()).isEqualTo("Někdo zahájil obnovu přístupu k vašemu účtu – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    po přihlášení správným heslem někdo zahájil obnovu přístupu k vašemu dárcovskému účtu Nová naděje platbou 1 Kč. Dvoufaktorové ověření se vypne, jen pokud na účet nadace dorazí platba 1 Kč s kódem pro obnovu přístupu z bankovního účtu, který od vás známe, a pod vaším jménem.

                    Pokud jste to byli vy, nemusíte nic dělat; bez té platby se nic nezmění.

                    Pokud jste obnovu přístupu nezahájili, zná někdo vaše heslo. Změňte si ho prosím hned (tím se ukončí všechna ostatní přihlášení) a napište nám na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains(">Obnova přístupu je zahájená</h1>")
                    .contains("zná někdo vaše heslo")
                    .contains("src=\"cid:logo\"");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("second-factor-recovery-started", email);
        });
    }

    @Test
    @DisplayName("Given an English donor, when a recovery of the second factor starts, then subject and texts are English")
    void should_write_english_when_a_recovery_starts_given_an_english_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendRecoveryStartedNotice(new DonorSecondFactorRecoveryStarted(DONOR_ID, EMAIL, LocaleCode.EN));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("Someone started an access recovery for your account – Nová naděje");
            assertThat(MailContents.plainText(email)).startsWith("Hello,").contains("the foundation's account").contains("someone knows your password");
            assertThat(MailContents.html(email)).contains("lang=\"en\"").contains(">Access recovery started</h1>");
        });
    }

    @Test
    @DisplayName("Given a Czech donor, when a new sender account is learned, then the donor is told its last four digits and what to do if they do not know it")
    void should_tell_the_donor_in_czech_when_an_account_is_learned_given_a_czech_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendSenderAccountLearnedNotice(new DonorSenderAccountLearned(DONOR_ID, EMAIL, LocaleCode.CS, "5399"));

            assertThat(recording.sent()).hasSize(1);
            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getSubject()).isEqualTo("Zapamatovali jsme si nový bankovní účet – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    zapamatovali jsme si nový bankovní účet …5399, ze kterého přišla platba s vaším variabilním symbolem. Další platby z něj přiřadíme k vašemu dárcovskému účtu Nová naděje i bez symbolu.

                    Pokud je to váš účet nebo účet někoho, kdo za vás posílá dary, nemusíte nic dělat. Účty, ze kterých vám dary přiřazujeme, najdete po přihlášení v části Bankovní účty.

                    Pokud tento účet neznáte, změňte si prosím hned heslo (tím se ukončí všechna ostatní přihlášení) a napište nám na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains(">Nový bankovní účet u vašeho účtu</h1>")
                    .contains("nový bankovní účet …5399, ze kterého")
                    .contains("src=\"cid:logo\"");
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
            MailPreviews.save("sender-account-learned", email);
        });
    }

    @Test
    @DisplayName("Given an English donor, when a new sender account is learned, then subject and texts are English")
    void should_write_english_when_an_account_is_learned_given_an_english_donor() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context).sendSenderAccountLearnedNotice(new DonorSenderAccountLearned(DONOR_ID, EMAIL, LocaleCode.EN, "5399"));

            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("We remembered a new bank account – Nová naděje");
            assertThat(MailContents.plainText(email)).startsWith("Hello,").contains("the new bank account …5399, from which");
            assertThat(MailContents.html(email)).contains("lang=\"en\"").contains(">A new bank account for your account</h1>");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the notices are sent, then each ERROR line names the donor and the exception class, never an address or an account")
    void should_log_ids_and_exception_class_only_when_sent_given_a_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            DonorSecurityNoticeEmailSender sender = sender(context);
            sender.sendRecoveryStartedNotice(new DonorSecondFactorRecoveryStarted(DONOR_ID, EMAIL, LocaleCode.CS));
            sender.sendSenderAccountLearnedNotice(new DonorSenderAccountLearned(DONOR_ID, EMAIL, LocaleCode.CS, "5399"));

            assertThat(logged.list).hasSize(2).allSatisfy(line -> {
                assertThat(line.getLevel()).isEqualTo(Level.ERROR);
                assertThat(line.getFormattedMessage()).contains(DONOR_ID.toString()).contains("MailSendException")
                        .doesNotContain("example.cz").doesNotContain("5399");
                assertThat(line.getThrowableProxy()).isNull();
            });
            assertThat(logged.list).extracting(ILoggingEvent::getFormattedMessage).containsExactly(
                    "The second-factor recovery start e-mail for donor " + DONOR_ID + " could not be sent: MailSendException",
                    "The learned sender account e-mail for donor " + DONOR_ID + " could not be sent: MailSendException");
        });
    }

    private static DonorSecurityNoticeEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new DonorSecurityNoticeEmailSender(ObservedMailSenders.of(mailSender), emails, context.getBean(MessageSource.class), sender);
    }
}
