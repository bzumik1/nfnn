package cz.novanadeje.app.contact.cucumber;

import cz.novanadeje.app.contact.infrastructure.persistence.ContactMessageJpaRepository;
import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;

import java.time.Duration;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class ContactMessageStepDefinitions {

    private static final String MESSAGES_PATH = "/api/contact/messages";

    private final ApiClient api;
    private final RecordingMailSender mailSender;
    private final ContactMessageJpaRepository messages;
    private long messagesBefore;

    public ContactMessageStepDefinitions(ApiClient api, RecordingMailSender mailSender, ContactMessageJpaRepository messages) {
        this.api = api;
        this.mailSender = mailSender;
        this.messages = messages;
    }

    @Given("the email server accepts messages")
    public void theEmailServerAcceptsMessages() {
        mailSender.clear();
    }

    @Given("the visitor already sent {int} contact messages within the last hour")
    public void theVisitorAlreadySentContactMessages(int count) {
        for (int i = 0; i < count; i++) {
            api.post(MESSAGES_PATH, validMessage());
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(202);
        }
    }

    @When("the visitor submits a contact message")
    public void theVisitorSubmitsAContactMessage(Map<String, String> fields) {
        messagesBefore = messages.count();
        Map<String, String> body = new HashMap<>(fields);
        body.putIfAbsent("website", "");
        api.post(MESSAGES_PATH, body);
    }

    @When("the visitor submits a contact message with a non-empty {string} field")
    public void theVisitorSubmitsAContactMessageWithANonEmptyField(String honeypotField) {
        messagesBefore = messages.count();
        Map<String, String> body = new HashMap<>(validMessage());
        body.put(honeypotField, "https://spam.example");
        api.post(MESSAGES_PATH, body);
    }

    @Then("one email is delivered to {string}")
    public void oneEmailIsDeliveredTo(String recipient) throws Exception {
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(mailSender.sent()).hasSize(1));
        MimeMessage email = mailSender.sent().getFirst();
        assertThat(Arrays.stream(email.getRecipients(Message.RecipientType.TO)).map(Object::toString)).containsExactly(recipient);
    }

    @And("the email comes from {string}")
    public void theEmailComesFrom(String sender) throws Exception {
        MimeMessage email = mailSender.sent().getFirst();
        assertThat(Arrays.stream(email.getFrom()).map(Object::toString)).containsExactly(sender);
    }

    @And("the email can be answered to {string}")
    public void theEmailCanBeAnsweredTo(String replyTo) throws Exception {
        MimeMessage email = mailSender.sent().getFirst();
        assertThat(Arrays.stream(email.getReplyTo()).map(Object::toString)).containsExactly(replyTo);
    }

    @And("the email mentions {string} and {string}")
    public void theEmailMentions(String first, String second) throws Exception {
        MimeMessage email = mailSender.sent().getFirst();
        assertThat(email.getSubject()).contains(first);
        assertThat(email.getContent().toString()).contains(first, second);
    }

    @Then("no email is sent")
    public void noEmailIsSent() throws InterruptedException {
        Thread.sleep(300);
        assertThat(mailSender.sent()).isEmpty();
    }

    @And("the message is stored")
    public void theMessageIsStored() {
        assertThat(messages.count()).isEqualTo(messagesBefore + 1);
    }

    @And("no message is stored")
    public void noMessageIsStored() {
        assertThat(messages.count()).isEqualTo(messagesBefore);
    }

    private static Map<String, String> validMessage() {
        return Map.of(
                "fullName", "Jana Nováková",
                "email", "jana@example.cz",
                "message", "Mám dotaz k projektu.",
                "website", ""
        );
    }
}
