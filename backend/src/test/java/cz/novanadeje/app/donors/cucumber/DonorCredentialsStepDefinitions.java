package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorRegistrations;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class DonorCredentialsStepDefinitions {

    private static final String PASSWORD_PATH = "/api/donors/me/password";
    private static final String EMAIL_CHANGE_PATH = "/api/donors/me/email-change";
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);

    private final ApiClient api;
    private final DonorRegistrations registrations;
    private final RecordingMailSender mailSender;
    private String keptToken;

    public DonorCredentialsStepDefinitions(ApiClient api, DonorRegistrations registrations, RecordingMailSender mailSender) {
        this.api = api;
        this.registrations = registrations;
        this.mailSender = mailSender;
    }

    @Given("nobody is signed in")
    public void nobodyIsSignedIn() {
        api.forgetCredentials();
    }

    @When("the donor changes the password from {string} to {string}")
    public void theDonorChangesThePassword(String current, String next) {
        api.put(PASSWORD_PATH, Map.of("currentPassword", current, "newPassword", next));
    }

    @Given("the donor changed the password from {string} to {string} {int} times")
    public void theDonorChangedThePasswordTimes(String current, String next, int times) {
        for (int i = 0; i < times; i++) {
            theDonorChangesThePassword(current, next);
            assertThat(api.lastResponse().getStatusCode().value()).isIn(200, 400);
        }
    }

    @When("the donor asks to change the e-mail to {string} with password {string}")
    public void theDonorAsksToChangeTheEmail(String newEmail, String password) {
        api.post(EMAIL_CHANGE_PATH, Map.of("newEmail", newEmail, "password", password));
    }

    @Given("the donor asked to change the e-mail with password {string} {int} times")
    public void theDonorAskedToChangeTheEmailTimes(String password, int times) {
        for (int i = 0; i < times; i++) {
            theDonorAsksToChangeTheEmail("jana" + i + "@example.cz", password);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(202);
        }
    }

    @And("the donor keeps the link from the e-mail")
    public void theDonorKeepsTheLinkFromTheEmail() {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).isNotEmpty());
        keptToken = DonorRegistrations.tokenOf(mailSender.sent().getLast());
    }

    @When("the donor confirms the e-mail with the kept link")
    public void theDonorConfirmsTheEmailWithTheKeptLink() {
        registrations.confirm(keptToken);
    }

    @Then("e-mail {int} goes to {string} with the subject {string}")
    public void emailGoesToWithTheSubject(int position, String recipient, String subject) throws Exception {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(position));
        MimeMessage sent = mailSender.sent().get(position - 1);
        assertThat(sent.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly(recipient);
        assertThat(sent.getSubject()).isEqualTo(subject);
    }
}
