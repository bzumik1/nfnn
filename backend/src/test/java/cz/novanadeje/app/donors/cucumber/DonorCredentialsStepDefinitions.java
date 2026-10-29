package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorRegistrations;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;

import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.awaitility.Awaitility.await;

public class DonorCredentialsStepDefinitions {

    private static final String PASSWORD_PATH = "/api/donors/me/password";
    private static final String EMAIL_CHANGE_PATH = "/api/donors/me/email-change";
    private static final String EMAIL_CHANGE_RESEND_PATH = "/api/donors/me/email-change/resend";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);

    private final ApiClient api;
    private final DonorRegistrations registrations;
    private final RecordingMailSender mailSender;
    private final MutableClock clock;
    private String keptToken;

    public DonorCredentialsStepDefinitions(ApiClient api, DonorRegistrations registrations, RecordingMailSender mailSender, MutableClock clock) {
        this.api = api;
        this.registrations = registrations;
        this.mailSender = mailSender;
        this.clock = clock;
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

    @When("the donor asks to send the e-mail change link again")
    public void theDonorAsksToSendTheEmailChangeLinkAgain() {
        api.post(EMAIL_CHANGE_RESEND_PATH, Map.of());
    }

    @Given("the donor asked to send the e-mail change link again {int} times")
    public void theDonorAskedToSendTheEmailChangeLinkAgainTimes(int times) {
        for (int i = 0; i < times; i++) {
            theDonorAsksToSendTheEmailChangeLinkAgain();
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(202);
        }
    }

    @When("the donor cancels the e-mail change")
    public void theDonorCancelsTheEmailChange() {
        api.delete(EMAIL_CHANGE_PATH);
    }

    @Then("the donor profile shows a pending e-mail change to {string} expiring {int} hours from now")
    public void theDonorProfileShowsAPendingEmailChange(String newEmail, int hours) {
        JsonNode pending = profile().get("pendingEmailChange");
        assertThat(pending.isObject()).withFailMessage("No pending e-mail change in %s", api.lastResponse().getBody()).isTrue();
        assertThat(pending.get("newEmail").asString()).isEqualTo(newEmail);
        assertThat(Instant.parse(pending.get("expiresAt").asString()))
                .isCloseTo(clock.instant().plus(Duration.ofHours(hours)), within(1, ChronoUnit.MILLIS));
    }

    @Then("the donor profile shows no pending e-mail change")
    public void theDonorProfileShowsNoPendingEmailChange() {
        assertThat(profile().get("pendingEmailChange").isNull()).withFailMessage("Pending e-mail change in %s", api.lastResponse().getBody())
                .isTrue();
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

    private JsonNode profile() {
        assertThat(api.get(PROFILE_PATH).getStatusCode().value()).withFailMessage("Profile answered %s", api.lastResponse().getBody())
                .isEqualTo(200);
        return api.lastResponseJson();
    }

    @Then("e-mail {int} goes to {string} with the subject {string}")
    public void emailGoesToWithTheSubject(int position, String recipient, String subject) throws Exception {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(position));
        MimeMessage sent = mailSender.sent().get(position - 1);
        assertThat(sent.getRecipients(Message.RecipientType.TO)).extracting(Object::toString).containsExactly(recipient);
        assertThat(sent.getSubject()).isEqualTo(subject);
    }
}
