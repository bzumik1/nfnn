package cz.novanadeje.app.shared.infrastructure.mail;

import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import cz.novanadeje.app.support.RecordingMailSender;
import jakarta.mail.Address;
import jakarta.mail.SendFailedException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

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

    @Test
    @DisplayName("Given a mail server that refuses only a recipient's address, when the e-mail is sent, then the refusal is passed on and neither a failure nor a success is told, since the server itself works")
    void should_tell_nothing_when_sent_given_only_a_recipient_refused() throws Exception {
        JavaMailSender refusing = mock(JavaMailSender.class);
        MimeMessage message = message();
        SendFailedException refusedRecipient = new SendFailedException("Invalid Addresses", null, new Address[0], new Address[0],
                new Address[]{new InternetAddress("nikdo@example.cz")});
        doThrow(new MailSendException(Map.of(message, refusedRecipient))).when(refusing).send(message);
        ObservedMailSender observed = new ObservedMailSender(refusing, events::add, Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatExceptionOfType(MailSendException.class).isThrownBy(() -> observed.send(message));

        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("Given a mail server that refuses the sign-in, when the e-mail is sent, then one failure is told even though no recipient was refused")
    void should_tell_failure_when_sent_given_sign_in_refused() {
        JavaMailSender refusing = mock(JavaMailSender.class);
        MimeMessage message = message();
        doThrow(new MailAuthenticationException("535 refused")).when(refusing).send(message);
        ObservedMailSender observed = new ObservedMailSender(refusing, events::add, Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatExceptionOfType(MailAuthenticationException.class).isThrownBy(() -> observed.send(message));

        assertThat(events).containsExactly(new MailDeliveryFailed(NOW));
    }

    private static MimeMessage message() {
        return new MimeMessage(Session.getInstance(new Properties()));
    }
}
