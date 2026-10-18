package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.donors.domain.PasswordResetSecret;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.infrastructure.persistence.PasswordResetTokenJpaRepository;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.springframework.http.ResponseEntity;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class DonorPasswordResetStepDefinitions {

    private static final String REQUEST_PATH = "/api/donors/auth/password-reset/request";
    private static final String CONFIRM_PATH = "/api/donors/auth/password-reset/confirm";
    private static final String REFRESH_PATH = "/api/donors/auth/refresh";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final Pattern TOKEN_IN_LINK = Pattern.compile("obnova-hesla#token=([A-Za-z0-9_-]{43})");
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);
    private static final Duration SETTLE = Duration.ofMillis(300);

    private final ApiClient api;
    private final RecordingMailSender mailSender;
    private final PasswordResetTokenJpaRepository tokenRows;
    private final PasswordResetTokenRepository tokens;
    private final List<Integer> requestStatuses = new ArrayList<>();

    public DonorPasswordResetStepDefinitions(ApiClient api, RecordingMailSender mailSender, PasswordResetTokenJpaRepository tokenRows,
                                             PasswordResetTokenRepository tokens) {
        this.api = api;
        this.mailSender = mailSender;
        this.tokenRows = tokenRows;
        this.tokens = tokens;
    }

    @When("a password reset is asked for {string}")
    public void aPasswordResetIsAskedFor(String email) {
        askForReset(email);
    }

    @When("a password reset is asked for {string} {int} times")
    public void aPasswordResetIsAskedForTimes(String email, int times) {
        requestStatuses.clear();
        for (int i = 0; i < times; i++) {
            requestStatuses.add(askForReset(email).getStatusCode().value());
        }
    }

    @Given("a password reset is asked for {string}, {string}, {string}, {string} and {string}")
    public void aPasswordResetIsAskedForFiveAddresses(String first, String second, String third, String fourth, String fifth) {
        for (String email : List.of(first, second, third, fourth, fifth)) {
            assertThat(askForReset(email).getStatusCode().value()).isEqualTo(202);
        }
    }

    @When("a password reset is asked for {string} with the Host and X-Forwarded-Host {string}")
    public void aPasswordResetIsAskedForWithTheHost(String email, String host) {
        api.postRaw(REQUEST_PATH, "{\"email\":\"" + email + "\"}", Map.of("Host", host, "X-Forwarded-Host", host));
    }

    @Given("the donor asked for a password reset for {string}")
    public void theDonorAskedForAPasswordReset(String email) {
        int mailsBefore = mailSender.sent().size();
        ResponseEntity<String> response = askForReset(email);
        assertThat(response.getStatusCode().value()).withFailMessage("The reset request answered %s", response.getBody()).isEqualTo(202);
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSize(mailsBefore + 1));
    }

    @When("the donor sets the new password {string} with the link from the e-mail")
    public void theDonorSetsTheNewPasswordWithTheLink(String password) {
        confirm(tokenOf(lastEmail()), password);
    }

    @When("the donor sets the new password {string} with the link from e-mail {int}")
    public void theDonorSetsTheNewPasswordWithTheLinkFromEmail(String password, int position) {
        confirm(tokenOf(emailAt(position)), password);
    }

    @When("a password reset is confirmed with token {string} and password {string}")
    public void aPasswordResetIsConfirmedWith(String token, String password) {
        confirm(token, password);
    }

    @When("a password reset is confirmed with an unknown well-formed token and password {string}")
    public void aPasswordResetIsConfirmedWithAnUnknownToken(String password) {
        confirm(PasswordResetSecret.generate().value(), password);
    }

    @When("the link's token is presented as the refresh cookie")
    public void theLinksTokenIsPresentedAsTheRefreshCookie() {
        api.forgetCredentials();
        api.sendCookie("refresh_token=" + tokenOf(lastEmail()));
        api.post(REFRESH_PATH, Map.of());
    }

    @When("the link's token is presented as a bearer token for the profile")
    public void theLinksTokenIsPresentedAsABearerToken() {
        api.forgetCredentials();
        api.authorize(tokenOf(lastEmail()));
        api.get(PROFILE_PATH);
    }

    @Then("every one of these requests is answered {int}")
    public void everyOneOfTheseRequestsIsAnswered(int status) {
        assertThat(requestStatuses).isNotEmpty().containsOnly(status);
    }

    @Then("{int} password reset link(s) is/are stored")
    public void passwordResetLinksAreStored(int count) {
        assertThat(tokenRows.count()).isEqualTo(count);
    }

    @And("the stored link expires one hour after it was issued")
    public void theStoredLinkExpiresOneHourAfterItWasIssued() {
        PasswordResetToken token = tokens.findBySecretHash(new PasswordResetSecret(tokenOf(awaitEmails(1).getLast())).hash()).orElseThrow();
        assertThat(Duration.between(token.issuedAt(), token.expiresAt())).isEqualTo(Duration.ofHours(1));
    }

    @And("the link from the e-mail is marked as used")
    public void theLinkFromTheEmailIsMarkedAsUsed() {
        PasswordResetToken token = tokens.findBySecretHash(new PasswordResetSecret(tokenOf(lastEmail())).hash()).orElseThrow();
        assertThat(token.usedAt()).isPresent();
    }

    @Then("{int} reset e-mail(s) is/are sent to {string}")
    public void resetEmailsAreSentTo(int count, String recipient) throws Exception {
        List<MimeMessage> emails = awaitEmails(count);
        for (MimeMessage email : emails) {
            assertThat(Arrays.stream(email.getRecipients(Message.RecipientType.TO)).map(Object::toString)).containsExactly(recipient);
        }
    }

    @Then("no reset e-mail is sent")
    public void noResetEmailIsSent() throws InterruptedException {
        Thread.sleep(SETTLE.toMillis());
        assertThat(mailSender.sent()).isEmpty();
    }

    @And("the reset e-mail comes from {string} named {string}")
    public void theResetEmailComesFrom(String address, String name) throws Exception {
        InternetAddress from = (InternetAddress) MailContents.asReceived(lastEmail()).getFrom()[0];
        assertThat(from.getAddress()).isEqualTo(address);
        assertThat(from.getPersonal()).isEqualTo(name);
    }

    @And("the reset e-mail has the subject {string}")
    public void theResetEmailHasTheSubject(String subject) throws Exception {
        assertThat(MailContents.asReceived(lastEmail()).getSubject()).isEqualTo(subject);
    }

    @And("both parts of the reset e-mail contain {string}")
    public void bothPartsOfTheResetEmailContain(String text) {
        MimeMessage email = lastEmail();
        assertThat(MailContents.plainText(email)).contains(text);
        assertThat(MailContents.html(email)).contains(text);
    }

    @And("neither part of the reset e-mail contains {string}")
    public void neitherPartOfTheResetEmailContains(String text) {
        MimeMessage email = lastEmail();
        assertThat(MailContents.plainText(email)).doesNotContain(text);
        assertThat(MailContents.html(email)).doesNotContain(text);
    }

    @And("the problem has the title {string}")
    public void theProblemHasTheTitle(String title) {
        assertThat(api.lastResponseJson().get("title").asString()).isEqualTo(title);
    }

    private ResponseEntity<String> askForReset(String email) {
        return api.post(REQUEST_PATH, Map.of("email", email));
    }

    private void confirm(String token, String password) {
        api.post(CONFIRM_PATH, Map.of("token", token, "password", password));
    }

    private List<MimeMessage> awaitEmails(int count) {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(count));
        await().pollDelay(SETTLE).atMost(MAIL_WAIT).until(() -> true);
        assertThat(mailSender.sent()).hasSize(count);
        return mailSender.sent();
    }

    private MimeMessage lastEmail() {
        assertThat(mailSender.sent()).withFailMessage("No e-mail was sent").isNotEmpty();
        return mailSender.sent().getLast();
    }

    private MimeMessage emailAt(int position) {
        assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(position);
        return mailSender.sent().get(position - 1);
    }

    private static String tokenOf(MimeMessage email) {
        Matcher token = TOKEN_IN_LINK.matcher(MailContents.plainText(email));
        assertThat(token.find()).withFailMessage("No reset link in the e-mail").isTrue();
        return token.group(1);
    }
}
