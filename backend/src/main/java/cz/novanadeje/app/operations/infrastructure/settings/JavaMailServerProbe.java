package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.MailServer;
import cz.novanadeje.app.operations.application.settings.MailServerProbe;
import cz.novanadeje.app.operations.application.settings.TestEmail;
import cz.novanadeje.app.operations.application.settings.TestEmailOutcome;
import cz.novanadeje.app.shared.infrastructure.mail.BrandedEmails;
import cz.novanadeje.app.shared.infrastructure.mail.EmailDraft;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

@Component
class JavaMailServerProbe implements MailServerProbe {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final Locale CZECH = Locale.forLanguageTag("cs");
    private static final String KEYS = "operations.testEmail.email.";
    private static final String TEMPLATE = "email/operations/test-email";

    private static final Logger log = LoggerFactory.getLogger(JavaMailServerProbe.class);

    private final BrandedEmails emails;
    private final MessageSource messages;
    private final Duration timeout;

    @Autowired
    JavaMailServerProbe(BrandedEmails emails, MessageSource messages) {
        this(emails, messages, TIMEOUT);
    }

    JavaMailServerProbe(BrandedEmails emails, MessageSource messages, Duration timeout) {
        this.emails = emails;
        this.messages = messages;
        this.timeout = timeout;
    }

    @Override
    public TestEmailOutcome sendTestEmail(MailServer server, TestEmail email) {
        JavaMailSenderImpl sender = senderFor(server);
        try {
            sender.send(compose(server, email, sender));
            log.info("Test e-mail sent through the typed mail server");
            return TestEmailOutcome.SENT;
        } catch (MailException failure) {
            TestEmailOutcome outcome = SmtpFailures.classify(failure);
            log.warn("Test e-mail not sent: {} ({})", outcome, failure.getClass().getSimpleName());
            return outcome;
        }
    }

    MimeMessage compose(MailServer server, TestEmail email, JavaMailSenderImpl sender) {
        String route = text("route", server.host() + ":" + server.port(), email.sender());
        String inbox = text("inbox");
        String spam = text("spam");
        String unsaved = text("unsaved");
        String footer = text("footer");
        String plain = String.join("\n\n", List.of(text("greeting"), text("intro"), route, inbox, spam, unsaved, text("signature"), footer)) + "\n";
        return emails.compose(new EmailDraft(CZECH, email.recipient(), text("subject"), text("title"), TEMPLATE,
                Map.of("route", route, "inbox", inbox, "spam", spam, "unsaved", unsaved), plain, footer), sender, email.sender());
    }

    private JavaMailSenderImpl senderFor(MailServer server) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(server.host());
        sender.setPort(server.port());
        sender.setDefaultEncoding("UTF-8");
        if (server.auth()) {
            sender.setUsername(server.username());
            sender.setPassword(server.password());
        }
        String millis = Long.toString(timeout.toMillis());
        Properties properties = new Properties();
        properties.setProperty("mail.smtp.auth", Boolean.toString(server.auth()));
        properties.setProperty("mail.smtp.starttls.enable", Boolean.toString(server.startTls()));
        properties.setProperty("mail.smtp.starttls.required", Boolean.toString(server.startTls()));
        properties.setProperty("mail.smtp.connectiontimeout", millis);
        properties.setProperty("mail.smtp.timeout", millis);
        properties.setProperty("mail.smtp.writetimeout", millis);
        sender.setJavaMailProperties(properties);
        return sender;
    }

    private String text(String key, Object... arguments) {
        return messages.getMessage(KEYS + key, arguments.length == 0 ? null : arguments, CZECH);
    }
}
