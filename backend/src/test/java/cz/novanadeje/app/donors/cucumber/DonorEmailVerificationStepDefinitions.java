package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorRegistrations;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
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
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class DonorEmailVerificationStepDefinitions {

    private static final String REQUEST_PATH = "/api/donors/auth/email-verification/request";
    private static final String REFRESH_PATH = "/api/donors/auth/refresh";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);
    private static final Duration SETTLE = Duration.ofMillis(300);

    private final ApiClient api;
    private final DonorRegistrations registrations;
    private final RecordingMailSender mailSender;
    private final JdbcClient jdbc;
    private final EmailVerificationTokenRepository tokens;
    private final List<Integer> requestStatuses = new ArrayList<>();

    public DonorEmailVerificationStepDefinitions(ApiClient api, DonorRegistrations registrations, RecordingMailSender mailSender,
                                                 JdbcClient jdbc, EmailVerificationTokenRepository tokens) {
        this.api = api;
        this.registrations = registrations;
        this.mailSender = mailSender;
        this.jdbc = jdbc;
        this.tokens = tokens;
    }

    @When("the donor confirms the e-mail with the link from the e-mail")
    public void theDonorConfirmsWithTheLinkFromTheEmail() {
        registrations.confirm(DonorRegistrations.tokenOf(lastEmail()));
    }

    @When("the donor confirms the e-mail with the link from e-mail {int}")
    public void theDonorConfirmsWithTheLinkFromEmail(int position) {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(position));
        registrations.confirm(DonorRegistrations.tokenOf(mailSender.sent().get(position - 1)));
    }

    @When("the e-mail is confirmed with token {string}")
    public void theEmailIsConfirmedWithToken(String token) {
        registrations.confirm(token);
    }

    @When("the e-mail is confirmed with an unknown well-formed token")
    public void theEmailIsConfirmedWithAnUnknownToken() {
        registrations.confirm(LinkSecret.generate().value());
    }

    @When("a verification e-mail is asked for {string}")
    public void aVerificationEmailIsAskedFor(String email) {
        askForVerification(email);
    }

    @When("a verification e-mail is asked for {string} {int} times")
    public void aVerificationEmailIsAskedForTimes(String email, int times) {
        requestStatuses.clear();
        for (int i = 0; i < times; i++) {
            requestStatuses.add(askForVerification(email).getStatusCode().value());
        }
    }

    @Given("a verification e-mail is asked for {string}, {string}, {string}, {string} and {string}")
    public void aVerificationEmailIsAskedForFiveAddresses(String first, String second, String third, String fourth, String fifth) {
        for (String email : List.of(first, second, third, fourth, fifth)) {
            assertThat(askForVerification(email).getStatusCode().value()).isEqualTo(202);
        }
    }

    @When("the verification link's token is presented as the refresh cookie")
    public void theVerificationTokenIsPresentedAsTheRefreshCookie() {
        api.forgetCredentials();
        api.sendCookie("refresh_token=" + DonorRegistrations.tokenOf(lastEmail()));
        api.post(REFRESH_PATH, Map.of());
    }

    @When("the verification link's token is presented as a bearer token for the profile")
    public void theVerificationTokenIsPresentedAsABearerToken() {
        api.forgetCredentials();
        api.authorize(DonorRegistrations.tokenOf(lastEmail()));
        api.get(PROFILE_PATH);
    }

    @Then("each of these requests is answered {int}")
    public void eachOfTheseRequestsIsAnswered(int status) {
        assertThat(requestStatuses).isNotEmpty().containsOnly(status);
    }

    @Then("{int} verification link(s) is/are stored")
    public void verificationLinksAreStored(int count) {
        assertThat(tokenRowCount()).isEqualTo(count);
    }

    @And("the stored verification link expires {int} hours after it was issued")
    public void theStoredVerificationLinkExpiresHoursAfterItWasIssued(int hours) {
        EmailVerificationToken token = tokens.findBySecretHash(new LinkSecret(DonorRegistrations.tokenOf(lastEmail())).hash()).orElseThrow();
        assertThat(Duration.between(token.issuedAt(), token.expiresAt())).isEqualTo(Duration.ofHours(hours));
    }

    @And("the verification link from the e-mail is no longer stored")
    public void theVerificationLinkFromTheEmailIsNoLongerStored() {
        assertThat(tokens.findBySecretHash(new LinkSecret(DonorRegistrations.tokenOf(lastEmail())).hash())).isEmpty();
    }

    @Then("{int} e-mail(s) is/are sent to {string} with the subject {string}")
    public void emailsAreSentToWithTheSubject(int count, String recipient, String subject) throws Exception {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThanOrEqualTo(count));
        await().pollDelay(SETTLE).atMost(MAIL_WAIT).until(() -> true);
        assertThat(mailSender.sent()).hasSize(count);
        for (MimeMessage sent : mailSender.sent()) {
            MimeMessage email = MailContents.asReceived(sent);
            assertThat(Arrays.stream(email.getRecipients(Message.RecipientType.TO)).map(Object::toString)).containsExactly(recipient);
            assertThat(email.getSubject()).isEqualTo(subject);
        }
    }

    @And("the last e-mail comes from {string} named {string}")
    public void theLastEmailComesFrom(String address, String name) throws Exception {
        InternetAddress from = (InternetAddress) MailContents.asReceived(lastEmail()).getFrom()[0];
        assertThat(from.getAddress()).isEqualTo(address);
        assertThat(from.getPersonal()).isEqualTo(name);
    }

    @And("both parts of the last e-mail contain {string}")
    public void bothPartsOfTheLastEmailContain(String text) {
        MimeMessage email = lastEmail();
        assertThat(MailContents.plainText(email)).contains(text);
        assertThat(MailContents.html(email)).contains(text);
    }

    @And("neither part of the last e-mail contains {string}")
    public void neitherPartOfTheLastEmailContains(String text) {
        MimeMessage email = lastEmail();
        assertThat(MailContents.plainText(email)).doesNotContain(text);
        assertThat(MailContents.html(email)).doesNotContain(text);
    }

    private ResponseEntity<String> askForVerification(String email) {
        return api.post(REQUEST_PATH, Map.of("email", email));
    }

    private MimeMessage lastEmail() {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).withFailMessage("No e-mail was sent").isNotEmpty());
        return mailSender.sent().getLast();
    }

    private long tokenRowCount() {
        return jdbc.sql("select count(*) from donor_email_verification_token").query(Long.class).single();
    }
}
