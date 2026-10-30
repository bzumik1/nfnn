package cz.novanadeje.app.support;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
}
