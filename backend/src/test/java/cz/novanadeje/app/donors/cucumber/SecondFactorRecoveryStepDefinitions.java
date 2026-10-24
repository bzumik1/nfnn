package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.support.FakeFioClient;
import cz.novanadeje.app.support.FioMovements;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class SecondFactorRecoveryStepDefinitions {

    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final String RECOVERY_PATH = "/api/donors/auth/login/second-factor/recovery";
    private static final String UNKNOWN_CHALLENGE = "A".repeat(43);
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);
    private static final long FIRST_MOVEMENT_ID = 9001;

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;
    private final FakeFioClient fio;
    private final RecordingMailSender mailSender;
    private final JdbcClient jdbc;
    private final Clock clock;
    private String challenge;
    private String recoveryMessage;
    private long nextMovementId = FIRST_MOVEMENT_ID;

    public SecondFactorRecoveryStepDefinitions(ApiClient api, ScenarioDonors scenarioDonors, FakeFioClient fio, RecordingMailSender mailSender,
                                               JdbcClient jdbc, Clock clock) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
        this.fio = fio;
        this.mailSender = mailSender;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Given("{string} signs in with the right password up to the code")
    public void signsInWithTheRightPasswordUpToTheCode(String alias) {
        ScenarioDonors.Credentials credentials = scenarioDonors.credentialsOf(alias);
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(LOGIN_PATH, Map.of("email", credentials.email(), "password", credentials.password()));
        assertThat(response.getStatusCode().value()).withFailMessage("Sign-in answered %s", response.getBody()).isEqualTo(401);
        challenge = api.lastResponseJson().get("challenge").asString();
    }

    @When("{string} asks to recover the second factor by payment")
    public void asksToRecoverTheSecondFactorByPayment(String alias) {
        signsInWithTheRightPasswordUpToTheCode(alias);
        ResponseEntity<String> response = api.post(RECOVERY_PATH, Map.of("challenge", challenge));
        if (response.getStatusCode().is2xxSuccessful()) {
            recoveryMessage = api.lastResponseJson().get("message").asString();
        }
    }

    @When("a recovery by payment is asked with an unknown challenge")
    public void aRecoveryByPaymentIsAskedWithAnUnknownChallenge() {
        api.forgetCredentials();
        api.post(RECOVERY_PATH, Map.of("challenge", UNKNOWN_CHALLENGE));
    }

    @Given("a recovery by payment was asked with an unknown challenge {int} times")
    public void aRecoveryByPaymentWasAskedWithAnUnknownChallengeTimes(int times) {
        for (int i = 0; i < times; i++) {
            aRecoveryByPaymentIsAskedWithAnUnknownChallenge();
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(401);
        }
    }

    @Then("the instructions ask for {long} hellers to {string} with a recovery message, valid until {string}, from {date}")
    public void theInstructionsAskForFrom(long amountMinor, String accountNumber, String expiresAt, LocalDate usableFrom) {
        theInstructionsAskFor(amountMinor, accountNumber, expiresAt);
        assertThat(LocalDate.parse(api.lastResponseJson().get("usableFrom").asString())).isEqualTo(usableFrom);
    }

    @Then("the instructions ask for {long} hellers to {string} with a recovery message, valid until {string}, from today")
    public void theInstructionsAskForFromToday(long amountMinor, String accountNumber, String expiresAt) {
        theInstructionsAskFor(amountMinor, accountNumber, expiresAt);
        assertThat(api.lastResponseJson().get("usableFrom").isNull()).withFailMessage("Instructions %s", api.lastResponse().getBody()).isTrue();
    }

    private void theInstructionsAskFor(long amountMinor, String accountNumber, String expiresAt) {
        JsonNode body = api.lastResponseJson();
        assertThat(body.get("message").asString()).matches("OBNOVA [A-HJ-NP-Z2-9]{8}");
        assertThat(body.get("amountMinor").asLong()).isEqualTo(amountMinor);
        assertThat(body.get("currency").asString()).isEqualTo("CZK");
        assertThat(body.get("accountNumber").asString()).isEqualTo(accountNumber);
        assertThat(body.get("iban").asString()).isNotBlank();
        assertThat(Instant.parse(body.get("expiresAt").asString())).isEqualTo(Instant.parse(expiresAt));
    }

    @When("the bank account receives {string} with the recovery message from {string} today")
    public void theBankAccountReceivesWithTheRecoveryMessageFromToday(String amount, String account) {
        String[] numberAndBank = account.split("/");
        LocalDate today = LocalDate.ofInstant(clock.instant(), FoundationZone.ZONE);
        fio.addMovement(FioMovements.incoming(nextMovementId++, today, amount)
                .from(numberAndBank[0], numberAndBank[1])
                .named("Novakova Jana")
                .withMessage(recoveryMessage)
                .build());
    }

    @Then("{string} has the second factor {onOff}")
    public void hasTheSecondFactor(String alias, boolean on) {
        Long confirmed = jdbc.sql("select count(*) from donor_second_factor where donor_id = ? and confirmed_at is not null")
                .param(scenarioDonors.idOf(alias)).query(Long.class).single();
        assertThat(confirmed).isEqualTo(on ? 1 : 0);
    }

    @Then("every session of {string} has ended")
    public void everySessionOfHasEnded(String alias) {
        UUID donorId = scenarioDonors.idOf(alias);
        Long sessions = jdbc.sql("select count(*) from donor_refresh_token where donor_id = ?").param(donorId).query(Long.class).single();
        Long live = jdbc.sql("select count(*) from donor_refresh_token where donor_id = ? and revoked_at is null and used_at is null")
                .param(donorId).query(Long.class).single();
        assertThat(sessions).isPositive();
        assertThat(live).isZero();
    }

    @When("{string} signs in with the password alone")
    public void signsInWithThePasswordAlone(String alias) {
        ScenarioDonors.Credentials credentials = scenarioDonors.credentialsOf(alias);
        api.forgetCredentials();
        api.post(LOGIN_PATH, Map.of("email", credentials.email(), "password", credentials.password()));
    }

    @Then("{string} gets an e-mail with the subject {string}")
    public void getsAnEmailWithTheSubject(String alias, String subject) {
        String address = scenarioDonors.credentialsOf(alias).email();
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).anyMatch(sent -> isTo(sent, address, subject)));
    }

    private static boolean isTo(MimeMessage sent, String address, String subject) {
        try {
            return subject.equals(sent.getSubject())
                    && Arrays.stream(sent.getRecipients(Message.RecipientType.TO)).map(Object::toString).anyMatch(address::equals);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
