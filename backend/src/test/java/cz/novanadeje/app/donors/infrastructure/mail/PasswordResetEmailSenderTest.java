package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.DonorPasswordResetProperties;
import cz.novanadeje.app.donors.application.event.DonorPasswordResetRequested;
import cz.novanadeje.app.donors.domain.PasswordResetSecret;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.shared.infrastructure.mail.MailSenderProperties;
import cz.novanadeje.app.support.MailContents;
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

import java.time.Duration;
import java.time.Instant;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PasswordResetEmailSenderTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final String SENDER = "info@nfnn.cz";
    private static final PasswordResetSecret SECRET = PasswordResetSecret.generate();
    private static final String LINK = "http://localhost:4200/obnova-hesla#token=" + SECRET.value();
    private static final Instant EXPIRES_AT = Instant.parse("2026-10-18T11:00:00Z");

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(PasswordResetEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when the reset e-mail is sent, then it goes to the account from the foundation with the Czech subject and no Reply-To")
    void should_address_czech_email_when_sent_given_czech_donor() {
        sent(LocaleCode.CS, Duration.ofHours(1), email -> {
            InternetAddress from = (InternetAddress) email.getFrom()[0];
            assertThat(from.getAddress()).isEqualTo(SENDER);
            assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getHeader("Reply-To")).isNull();
            assertThat(email.getSubject()).isEqualTo("Obnova hesla k dárcovskému účtu – Nová naděje");
        });
    }

    @Test
    @DisplayName("Given a Czech donor, when the reset e-mail is sent, then the plain text carries every paragraph in order with the link on its own line")
    void should_write_plain_text_in_order_when_sent_given_czech_donor() {
        sent(LocaleCode.CS, Duration.ofHours(1), email -> assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                Dobrý den,

                pro váš dárcovský účet Nová naděje (jana@example.cz) jsme přijali žádost o nastavení nového hesla. Nové heslo si zvolíte na tomto odkazu:

                %s

                Odkaz platí 60 minut a lze ho použít jen jednou.

                Pokud jste o obnovu hesla nežádali, tento e-mail prosím ignorujte. Vaše heslo zůstává beze změny.

                Nová naděje – nadační fond

                Máte-li dotaz, napište nám na info@nfnn.cz.
                """.formatted(LINK)));
    }

    @Test
    @DisplayName("Given a Czech donor, when the reset e-mail is sent, then the HTML part carries the link as a button and as text, and every Czech text")
    void should_render_html_with_link_and_texts_when_sent_given_czech_donor() {
        sent(LocaleCode.CS, Duration.ofHours(1), email -> assertThat(MailContents.html(email))
                .contains("lang=\"cs\"")
                .contains("href=\"" + LINK + "\"")
                .contains(">" + LINK + "<")
                .contains("Nastavit nové heslo")
                .contains("Obnova hesla")
                .contains("Dobrý den,")
                .contains("(jana@example.cz)")
                .contains("Odkaz platí 60 minut a lze ho použít jen jednou.")
                .contains("Pokud jste o obnovu hesla nežádali")
                .contains("Máte-li dotaz, napište nám na info@nfnn.cz.")
                .doesNotContain("<img"));
    }

    @Test
    @DisplayName("Given a link valid for 1500 minutes, when the reset e-mail is sent, then both parts write the number without grouping")
    void should_write_minutes_without_grouping_when_sent_given_long_ttl() {
        sent(LocaleCode.CS, Duration.ofMinutes(1500), email -> {
            assertThat(MailContents.plainText(email)).contains("Odkaz platí 1500 minut a lze ho použít jen jednou.");
            assertThat(MailContents.html(email)).contains("Odkaz platí 1500 minut a lze ho použít jen jednou.");
        });
        sent(LocaleCode.EN, Duration.ofMinutes(1500), email ->
                assertThat(MailContents.plainText(email)).contains("The link is valid for 1500 minutes and can be used once."));
    }

    @Test
    @DisplayName("Given an English donor and a 30-minute link, when the reset e-mail is sent, then subject and texts are English and say 30 minutes")
    void should_write_english_with_ttl_when_sent_given_english_donor_and_short_ttl() {
        sent(LocaleCode.EN, Duration.ofMinutes(30), email -> {
            assertThat(email.getSubject()).isEqualTo("Password reset for your Nová naděje donor account");
            assertThat(((InternetAddress) email.getFrom()[0]).getPersonal()).isEqualTo("Nová naděje – nadační fond");
            assertThat(MailContents.plainText(email))
                    .startsWith("Hello,")
                    .contains("we received a request to set a new password for your Nová naděje donor account (jana@example.cz).")
                    .contains(LINK)
                    .contains("The link is valid for 30 minutes and can be used once.")
                    .contains("Questions? Write to info@nfnn.cz.");
            assertThat(MailContents.html(email))
                    .contains("lang=\"en\"")
                    .contains("Set a new password")
                    .contains("The link is valid for 30 minutes and can be used once.");
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the reset e-mail is sent, then one ERROR line names the donor and the exception class, never the address or the token")
    void should_log_donor_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context, Duration.ofHours(1)).send(event(LocaleCode.CS));

            assertThat(logged.list).hasSize(1);
            ILoggingEvent line = logged.list.getFirst();
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage())
                    .contains(DONOR_ID.toString())
                    .contains("MailSendException")
                    .doesNotContain("jana@example.cz")
                    .doesNotContain(SECRET.value());
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    private void sent(LocaleCode locale, Duration ttl, ThrowingAssertion assertion) {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context, ttl).send(event(locale));

            assertThat(recording.sent()).hasSize(1);
            assertion.accept(MailContents.asReceived(recording.sent().getFirst()));
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
        });
    }

    private static PasswordResetEmailSender sender(AssertableApplicationContext context, Duration ttl) {
        assertThat(context).hasNotFailed();
        return new PasswordResetEmailSender(context.getBean(JavaMailSender.class), context.getBean(ITemplateEngine.class),
                context.getBean(MessageSource.class), new MailSenderProperties(SENDER), new PublicUrlProperties("http://localhost:4200/"),
                new DonorPasswordResetProperties(ttl, 3));
    }

    private static DonorPasswordResetRequested event(LocaleCode locale) {
        return new DonorPasswordResetRequested(DONOR_ID, EMAIL, locale, SECRET, EXPIRES_AT);
    }

    @FunctionalInterface
    private interface ThrowingAssertion extends Consumer<MimeMessage> {

        void acceptThrowing(MimeMessage email) throws Exception;

        @Override
        default void accept(MimeMessage email) {
            try {
                acceptThrowing(email);
            } catch (RuntimeException | Error failure) {
                throw failure;
            } catch (Exception unreadable) {
                throw new IllegalStateException(unreadable);
            }
        }
    }
}
