package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.MailServer;
import cz.novanadeje.app.operations.application.settings.MailServerProbe;
import jakarta.mail.MessagingException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

import java.util.Properties;

@Component
class JavaMailServerProbe implements MailServerProbe {

    private static final String TIMEOUT_MILLIS = "10000";

    private static final Logger log = LoggerFactory.getLogger(JavaMailServerProbe.class);

    @Override
    public boolean canSignIn(MailServer server) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(server.host());
        sender.setPort(server.port());
        if (server.auth()) {
            sender.setUsername(server.username());
            sender.setPassword(server.password());
        }
        Properties properties = new Properties();
        properties.setProperty("mail.smtp.auth", Boolean.toString(server.auth()));
        properties.setProperty("mail.smtp.starttls.enable", Boolean.toString(server.startTls()));
        properties.setProperty("mail.smtp.starttls.required", Boolean.toString(server.startTls()));
        properties.setProperty("mail.smtp.connectiontimeout", TIMEOUT_MILLIS);
        properties.setProperty("mail.smtp.timeout", TIMEOUT_MILLIS);
        properties.setProperty("mail.smtp.writetimeout", TIMEOUT_MILLIS);
        sender.setJavaMailProperties(properties);
        try {
            sender.testConnection();
            log.info("Mail server test succeeded");
            return true;
        } catch (MessagingException | RuntimeException failure) {
            log.warn("Mail server test failed: {}", failure.getClass().getSimpleName());
            return false;
        }
    }
}
