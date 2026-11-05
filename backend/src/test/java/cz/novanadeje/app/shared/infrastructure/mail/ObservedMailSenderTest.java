package cz.novanadeje.app.shared.infrastructure.mail;

import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import cz.novanadeje.app.support.RecordingMailSender;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

class ObservedMailSenderTest {

    private static final Instant NOW = Instant.parse("2026-11-05T09:00:00Z");

    private final RecordingMailSender server = new RecordingMailSender();
    private final List<Object> events = new ArrayList<>();
    private final ObservedMailSender sender = new ObservedMailSender(server, events::add, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given a mail server that takes the e-mail, when it is sent, then it is delivered and one success is told")
    void should_tell_success_when_sent_given_server_takes_it() {
        MimeMessage message = message();

        sender.send(message);

        assertThat(server.sent()).containsExactly(message);
        assertThat(events).containsExactly(new MailDeliverySucceeded(NOW));
    }

    @Test
    @DisplayName("Given a mail server that refuses the e-mail, when it is sent, then the refusal is passed on and one failure is told")
    void should_tell_failure_and_rethrow_when_sent_given_server_refuses() {
        server.failNextSend();

        assertThatExceptionOfType(MailSendException.class).isThrownBy(() -> sender.send(message()));

        assertThat(server.sent()).isEmpty();
        assertThat(events).containsExactly(new MailDeliveryFailed(NOW));
    }

    private static MimeMessage message() {
        return new MimeMessage(Session.getInstance(new Properties()));
    }
}
