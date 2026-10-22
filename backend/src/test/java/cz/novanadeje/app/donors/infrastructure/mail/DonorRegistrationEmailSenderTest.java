package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.DonorEmailVerificationProperties;
import cz.novanadeje.app.donors.application.event.DonorEmailVerificationRequested;
import cz.novanadeje.app.donors.application.event.DonorRegistrationRepeated;
import cz.novanadeje.app.donors.domain.LinkSecret;
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

class DonorRegistrationEmailSenderTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final String SENDER = "info@nfnn.cz";
    private static final LinkSecret SECRET = LinkSecret.generate();
    private static final String LINK = "http://localhost:4200/potvrzeni-emailu#token=" + SECRET.value();
    private static final Instant EXPIRES_AT = Instant.parse("2026-10-19T10:00:00Z");

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(DonorRegistrationEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when the verification e-mail is sent, then it goes to the account from the foundation with the Czech subject")
    void should_address_czech_verification_when_sent_given_czech_donor() {
        verificationSent(LocaleCode.CS, Duration.ofHours(24), email -> {
            InternetAddress from = (InternetAddress) email.getFrom()[0];
            assertThat(from.getAddress()).isEqualTo(SENDER);
            assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getHeader("Reply-To")).isNull();
            assertThat(email.getSubject()).isEqualTo("Potvrďte svůj e-mail – Nová naděje");
        });
    }

    @Test
    @DisplayName("Given a Czech donor, when the verification e-mail is sent, then the plain text carries every paragraph in order with the link on its own line")
    void should_write_verification_plain_text_in_order_when_sent_given_czech_donor() {
        verificationSent(LocaleCode.CS, Duration.ofHours(24), email -> assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                Dobrý den,

                děkujeme za registraci dárcovského účtu Nová naděje (jana@example.cz). Zbývá potvrdit, že je tato adresa vaše:

                %s

                Odkaz platí 24 hodin a lze ho použít jen jednou. Do potvrzení se do účtu nepřihlásíte.

                Pokud jste se neregistrovali vy, tento e-mail prosím ignorujte. Účet bez potvrzení zůstane neaktivní.

                Nová naděje – nadační fond

                Máte-li dotaz, napište nám na info@nfnn.cz.
                """.formatted(LINK)));
    }

    @Test
    @DisplayName("Given a Czech donor, when the verification e-mail is sent, then the HTML part carries the link as a button and as text, and every Czech text")
    void should_render_verification_html_when_sent_given_czech_donor() {
        verificationSent(LocaleCode.CS, Duration.ofHours(24), email -> {
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains("href=\"" + LINK + "\"")
                    .contains(">" + LINK + "<")
                    .contains("Potvrdit e-mail")
                    .contains(">Vítejte v Nové naději</h1>")
                    .contains("(jana@example.cz)")
                    .contains("Pokud tlačítko nefunguje, otevřete tento odkaz:")
                    .contains("Odkaz platí 24 hodin a lze ho použít jen jednou.")
                    .contains("Pokud jste se neregistrovali vy")
                    .contains("S pozdravem")
                    .contains("Máte-li dotaz, napište nám na info@nfnn.cz.")
                    .contains("src=\"cid:logo\"");
            MailPreviews.save("email-verification", email);
        });
    }

    @Test
    @DisplayName("Given an English donor and a 48-hour link, when the verification e-mail is sent, then subject and texts are English and say 48 hours")
    void should_write_english_verification_when_sent_given_english_donor() {
        verificationSent(LocaleCode.EN, Duration.ofHours(48), email -> {
            assertThat(email.getSubject()).isEqualTo("Confirm your e-mail – Nová naděje");
            assertThat(MailContents.plainText(email))
                    .startsWith("Hello,")
                    .contains("thank you for registering a Nová naděje donor account (jana@example.cz).")
                    .contains(LINK)
                    .contains("The link is valid for 48 hours and can be used once.")
                    .contains("Questions? Write to info@nfnn.cz.");
            assertThat(MailContents.html(email))
                    .contains("lang=\"en\"")
                    .contains("Confirm e-mail")
                    .contains("The link is valid for 48 hours and can be used once.");
        });
    }

    @Test
    @DisplayName("Given a verified donor whose address was registered again, when the e-mail is sent, then it names the address, links the site and carries no token")
    void should_tell_about_existing_account_when_sent_given_repeated_registration() {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context, Duration.ofHours(24)).sendRegistrationRepeated(new DonorRegistrationRepeated(DONOR_ID, EMAIL, LocaleCode.CS));

            assertThat(recording.sent()).hasSize(1);
            MimeMessage email = MailContents.asReceived(recording.sent().getFirst());
            assertThat(email.getSubject()).isEqualTo("Váš dárcovský účet už existuje – Nová naděje");
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    někdo se právě pokusil založit dárcovský účet Nová naděje s vaší adresou jana@example.cz. Účet s touto adresou už existuje, proto jsme nový nezakládali.

                    Pokud jste to byli vy, stačí se přihlásit. Zapomenuté heslo si obnovíte na stránce přihlášení.

                    http://localhost:4200/

                    Pokud jste se neregistrovali vy, nemusíte nic dělat. Vaše údaje ani heslo se nezměnily.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains(">Účet už máte</h1>")
                    .contains("href=\"http://localhost:4200/\"")
                    .contains("Přihlásit se")
                    .doesNotContain("token=");
            MailPreviews.save("registration-repeated", email);
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the verification e-mail is sent, then one ERROR line names the donor and the exception class, never the address or the token")
    void should_log_donor_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context, Duration.ofHours(24)).sendVerification(verificationEvent(LocaleCode.CS));

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

    private void verificationSent(LocaleCode locale, Duration ttl, ThrowingAssertion assertion) {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            sender(context, ttl).sendVerification(verificationEvent(locale));

            assertThat(recording.sent()).hasSize(1);
            assertion.accept(MailContents.asReceived(recording.sent().getFirst()));
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
        });
    }

    private static DonorRegistrationEmailSender sender(AssertableApplicationContext context, Duration ttl) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new DonorRegistrationEmailSender(mailSender, emails, context.getBean(MessageSource.class), sender, publicUrl,
                new DonorEmailVerificationProperties(ttl, 3));
    }

    private static DonorEmailVerificationRequested verificationEvent(LocaleCode locale) {
        return new DonorEmailVerificationRequested(DONOR_ID, EMAIL, locale, SECRET, EXPIRES_AT);
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
