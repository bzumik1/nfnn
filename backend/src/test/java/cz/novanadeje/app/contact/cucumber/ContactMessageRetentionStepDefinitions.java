package cz.novanadeje.app.contact.cucumber;

import cz.novanadeje.app.contact.application.ContactMessageRetentionService;
import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

public class ContactMessageRetentionStepDefinitions {

    private final ContactMessageRepository messages;
    private final ContactMessageRetentionService retention;
    private final MutableClock clock;
    private final JdbcClient jdbc;

    public ContactMessageRetentionStepDefinitions(ContactMessageRepository messages, ContactMessageRetentionService retention, MutableClock clock,
                                                  JdbcClient jdbc) {
        this.messages = messages;
        this.retention = retention;
        this.clock = clock;
        this.jdbc = jdbc;
    }

    @Given("a contact message from {string} received {int} day(s) ago")
    public void aContactMessageReceivedDaysAgo(String senderName, int days) {
        messages.save(ContactMessage.receive(senderName, new EmailAddress("odesilatel@example.cz"), "Dobrý den.",
                clock.instant().minus(Duration.ofDays(days))));
    }

    @When("the contact message retention job runs")
    public void theContactMessageRetentionJobRuns() {
        retention.deleteExpiredMessages();
    }

    @Then("the stored contact messages are only from {string}")
    public void theStoredContactMessagesAreOnlyFrom(String senderName) {
        assertThat(jdbc.sql("select sender_name from contact_message").query(String.class).list()).containsExactly(senderName);
    }
}
