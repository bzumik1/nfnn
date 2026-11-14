package cz.novanadeje.app.support;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class RecordingMailSenderTest {

    @Test
    @DisplayName("Given a step that cleared the mail between two sends, when the scenario's mail is read, then both mails are there until the next scenario starts")
    void should_keep_every_mail_of_the_scenario_when_a_step_cleared_the_mail() {
        RecordingMailSender sender = new RecordingMailSender();
        MimeMessage first = new MimeMessage(Session.getInstance(new Properties()));
        MimeMessage second = new MimeMessage(Session.getInstance(new Properties()));

        sender.send(first);
        sender.clear();
        sender.send(second);

        assertThat(sender.sent()).containsExactly(second);
        assertThat(sender.sentInScenario()).containsExactly(first, second);
        sender.startScenario();
        assertThat(sender.sentInScenario()).isEmpty();
    }

    @Test
    @DisplayName("Given a mail server that takes 200 ms to accept an e-mail, when an e-mail is sent, then the send returns only after that time with the e-mail recorded, and once the mail is cleared it accepts at once again")
    void should_record_the_mail_only_after_the_acceptance_time_when_an_email_is_sent_given_a_slow_mail_server() {
        RecordingMailSender sender = new RecordingMailSender();
        sender.acceptAfter(Duration.ofMillis(200));

        long slowStart = System.nanoTime();
        sender.send(new MimeMessage(Session.getInstance(new Properties())));
        Duration slowSend = Duration.ofNanos(System.nanoTime() - slowStart);
        sender.clear();
        long quickStart = System.nanoTime();
        sender.send(new MimeMessage(Session.getInstance(new Properties())));
        Duration quickSend = Duration.ofNanos(System.nanoTime() - quickStart);

        assertThat(slowSend).isGreaterThanOrEqualTo(Duration.ofMillis(200));
        assertThat(quickSend).isLessThan(Duration.ofMillis(200));
        assertThat(sender.sentInScenario()).hasSize(2);
    }
}
