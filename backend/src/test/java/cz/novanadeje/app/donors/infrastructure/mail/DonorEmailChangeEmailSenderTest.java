package cz.novanadeje.app.donors.infrastructure.mail;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donors.application.DonorEmailVerificationProperties;
import cz.novanadeje.app.donors.application.event.DonorEmailAddressInUse;
import cz.novanadeje.app.donors.application.event.DonorEmailChangeRequested;
import cz.novanadeje.app.donors.application.event.DonorEmailChanged;
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

class DonorEmailChangeEmailSenderTest {

    private static final UUID DONOR_ID = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final EmailAddress NEW_EMAIL = new EmailAddress("jana.nova@example.cz");
    private static final String SENDER = "info@nfnn.cz";
    private static final LinkSecret SECRET = LinkSecret.generate();
    private static final String LINK = "http://localhost:4200/potvrzeni-emailu#token=" + SECRET.value();
    private static final Instant EXPIRES_AT = Instant.parse("2026-10-23T10:00:00Z");

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MessageSourceAutoConfiguration.class, ThymeleafAutoConfiguration.class));

    private ListAppender<ILoggingEvent> logged;
    private Logger senderLog;

    @BeforeEach
    void captureLog() {
        senderLog = (Logger) LoggerFactory.getLogger(DonorEmailChangeEmailSender.class);
        logged = new ListAppender<>();
        logged.start();
        senderLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        senderLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given a Czech donor, when the change link is sent, then it goes to the new address from the foundation with the link, the hours and every Czech text")
    void should_send_change_link_to_new_address_when_sent_given_czech_donor() {
        sent(LocaleCode.CS, sender -> sender.sendChangeLink(new DonorEmailChangeRequested(DONOR_ID, NEW_EMAIL, LocaleCode.CS, SECRET, EXPIRES_AT)), email -> {
            InternetAddress from = (InternetAddress) email.getFrom()[0];
            assertThat(from.getAddress()).isEqualTo(SENDER);
            assertThat(from.getPersonal()).isEqualTo("Nová naděje – nadační fond");
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana.nova@example.cz");
            assertThat(email.getSubject()).isEqualTo("Potvrďte novou e-mailovou adresu – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    u vašeho dárcovského účtu Nová naděje jste požádali o změnu e-mailu na jana.nova@example.cz. Zbývá potvrdit, že je tato adresa vaše:

                    %s

                    Odkaz platí 24 hodin a lze ho použít jen jednou. Do potvrzení zůstává u účtu původní adresa.

                    Pokud jste o změnu nežádali, tento e-mail prosím ignorujte. Nic se nezmění.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """.formatted(LINK));
            assertThat(MailContents.html(email))
                    .contains("lang=\"cs\"")
                    .contains("href=\"" + LINK + "\"")
                    .contains(">" + LINK + "<")
                    .contains("Potvrdit novou adresu")
                    .contains(">Potvrďte novou adresu</h1>")
                    .contains("jana.nova@example.cz")
                    .contains("Odkaz platí 24 hodin a lze ho použít jen jednou.")
                    .doesNotContain("jana@example.cz")
                    .contains("src=\"cid:logo\"");
            MailPreviews.save("email-change", email);
        });
    }

    @Test
    @DisplayName("Given an English donor, when the change link is sent, then subject and texts are English")
    void should_write_english_change_link_when_sent_given_english_donor() {
        sent(LocaleCode.EN, sender -> sender.sendChangeLink(new DonorEmailChangeRequested(DONOR_ID, NEW_EMAIL, LocaleCode.EN, SECRET, EXPIRES_AT)), email -> {
            assertThat(email.getSubject()).isEqualTo("Confirm your new e-mail address – Nová naděje");
            assertThat(MailContents.plainText(email))
                    .startsWith("Hello,")
                    .contains("you asked to change the e-mail of your Nová naděje donor account to jana.nova@example.cz.")
                    .contains(LINK)
                    .contains("The link is valid for 24 hours and can be used once.");
            assertThat(MailContents.html(email)).contains("lang=\"en\"").contains("Confirm the new address");
        });
    }

    @Test
    @DisplayName("Given a changed address, when the notice is sent, then it goes to the previous address, names both and tells where to write")
    void should_tell_previous_address_when_notice_sent_given_changed_address() {
        sent(LocaleCode.CS, sender -> sender.sendChangedNotice(new DonorEmailChanged(DONOR_ID, EMAIL, NEW_EMAIL, LocaleCode.CS)), email -> {
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getSubject()).isEqualTo("E-mail vašeho dárcovského účtu byl změněn – Nová naděje");
            assertThat(MailContents.plainText(email).replace("\r\n", "\n")).isEqualTo("""
                    Dobrý den,

                    e-mail vašeho dárcovského účtu Nová naděje byl právě změněn z jana@example.cz na jana.nova@example.cz. Od teď se přihlásíte novou adresou a na ni budou chodit i další zprávy; všechna dosavadní přihlášení jsme ukončili.

                    Pokud jste tuto změnu neprovedli vy, napište nám prosím co nejdříve na info@nfnn.cz.

                    Nová naděje – nadační fond

                    Máte-li dotaz, napište nám na info@nfnn.cz.
                    """);
            assertThat(MailContents.html(email))
                    .contains(">E-mail účtu byl změněn</h1>")
                    .contains("z jana@example.cz na jana.nova@example.cz")
                    .contains("napište nám prosím co nejdříve na info@nfnn.cz")
                    .doesNotContain("token=");
            MailPreviews.save("email-changed", email);
        });
    }

    @Test
    @DisplayName("Given an address another donor wanted, when the notice is sent, then it goes to its owner in the owner's language and carries no link")
    void should_tell_owner_when_notice_sent_given_address_in_use() {
        sent(LocaleCode.EN, sender -> sender.sendInUseNotice(new DonorEmailAddressInUse(DONOR_ID, EMAIL, LocaleCode.EN)), email -> {
            assertThat(email.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly("jana@example.cz");
            assertThat(email.getSubject()).isEqualTo("Another account tried to use your address – Nová naděje");
            assertThat(MailContents.plainText(email))
                    .startsWith("Hello,")
                    .contains("someone just tried to set your address jana@example.cz as the e-mail of another Nová naděje donor account.")
                    .contains("If it was not you, there is nothing to do.")
                    .doesNotContain("http");
            assertThat(MailContents.html(email))
                    .contains("lang=\"en\"")
                    .contains(">The address stays with your account</h1>")
                    .doesNotContain("token=");
        });
        sent(LocaleCode.CS, sender -> sender.sendInUseNotice(new DonorEmailAddressInUse(DONOR_ID, EMAIL, LocaleCode.CS)), email -> {
            assertThat(email.getSubject()).isEqualTo("Vaši adresu chtěl použít jiný účet – Nová naděje");
            assertThat(MailContents.html(email)).contains(">Adresa zůstává u vašeho účtu</h1>");
            MailPreviews.save("email-in-use", email);
        });
    }

    @Test
    @DisplayName("Given a mail server that refuses, when the change link is sent, then one ERROR line names the donor and the exception class, never an address or the token")
    void should_log_donor_and_exception_class_only_when_sent_given_failing_mail_server() {
        JavaMailSender failing = mock(JavaMailSender.class);
        when(failing.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("Failed messages: 550 jana.nova@example.cz rejected")).when(failing).send(any(MimeMessage.class));

        contexts.withBean(JavaMailSender.class, () -> failing).run(context -> {
            sender(context).sendChangeLink(new DonorEmailChangeRequested(DONOR_ID, NEW_EMAIL, LocaleCode.CS, SECRET, EXPIRES_AT));

            assertThat(logged.list).hasSize(1);
            ILoggingEvent line = logged.list.getFirst();
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage())
                    .contains(DONOR_ID.toString())
                    .contains("MailSendException")
                    .doesNotContain("example.cz")
                    .doesNotContain(SECRET.value());
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    private void sent(LocaleCode locale, Consumer<DonorEmailChangeEmailSender> action, ThrowingAssertion assertion) {
        RecordingMailSender recording = new RecordingMailSender();
        contexts.withBean(JavaMailSender.class, () -> recording).run(context -> {
            action.accept(sender(context));

            assertThat(recording.sent()).hasSize(1);
            assertion.accept(MailContents.asReceived(recording.sent().getFirst()));
            assertThat(logged.list).noneMatch(line -> line.getLevel() == Level.ERROR);
        });
    }

    private static DonorEmailChangeEmailSender sender(AssertableApplicationContext context) {
        assertThat(context).hasNotFailed();
        JavaMailSender mailSender = context.getBean(JavaMailSender.class);
        MailSenderProperties sender = new MailSenderProperties(SENDER);
        PublicUrlProperties publicUrl = new PublicUrlProperties("http://localhost:4200/");
        BrandedEmails emails = new BrandedEmails(mailSender, context.getBean(ITemplateEngine.class), context.getBean(MessageSource.class), sender, publicUrl);
        return new DonorEmailChangeEmailSender(mailSender, emails, context.getBean(MessageSource.class), sender, publicUrl,
                new DonorEmailVerificationProperties(Duration.ofHours(24), 3));
    }

    @FunctionalInterface
    private interface ThrowingAssertion {
        void accept(MimeMessage email) throws Exception;
    }
}
