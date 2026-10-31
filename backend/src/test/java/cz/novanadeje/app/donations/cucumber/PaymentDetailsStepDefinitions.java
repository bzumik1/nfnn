package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

public class PaymentDetailsStepDefinitions {

    private static final String PAYMENT_DETAILS_PATH = "/api/donations/payment-details";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private ResponseEntity<String> visitorsAnswer;

    public PaymentDetailsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
    }

    @Given("a visitor asked for the payment details {int} times")
    public void aVisitorAskedForThePaymentDetailsTimes(int times) {
        for (int request = 0; request < times; request++) {
            aVisitorAsksForThePaymentDetails();
            assertThat(api.lastResponse().getStatusCode().value()).as("request %d of %d", request + 1, times).isEqualTo(200);
        }
    }

    @When("a visitor asks for the payment details")
    public void aVisitorAsksForThePaymentDetails() {
        api.forgetCredentials();
        visitorsAnswer = api.get(PAYMENT_DETAILS_PATH);
    }

    @When("{string} asks for the payment details")
    public void asksForThePaymentDetails(String alias) {
        sessions.actAs(alias);
        api.get(PAYMENT_DETAILS_PATH);
    }

    @When("{string} asks for the payment details again with the access token she was given then")
    public void asksAgainWithTheAccessTokenGivenThen(String alias) {
        api.forgetCredentials();
        api.authorize(donors.accessTokenOf(alias));
        api.get(PAYMENT_DETAILS_PATH);
        api.forgetCredentials();
    }

    @When("a browser that sends the bearer token {string} asks for the payment details")
    public void aBrowserThatSendsTheBearerTokenAsks(String token) {
        api.forgetCredentials();
        api.authorize(token);
        api.get(PAYMENT_DETAILS_PATH);
        api.forgetCredentials();
    }

    @When("the visitor asks for the payment details again with the ETag it was given")
    public void theVisitorAsksAgainWithTheEtagItWasGiven() {
        theVisitorAsksAgainWithTheEtag(visitorsEtag());
    }

    @When("the visitor asks for the payment details again with the ETag it was given, marked weak")
    public void theVisitorAsksAgainWithTheWeakEtagItWasGiven() {
        theVisitorAsksAgainWithTheEtag("W/" + visitorsEtag());
    }

    @When("a visitor asks for the payment details again with the ETag {string}")
    public void theVisitorAsksAgainWithTheEtag(String etag) {
        api.forgetCredentials();
        api.sendHeader(HttpHeaders.IF_NONE_MATCH, etag);
        api.get(PAYMENT_DETAILS_PATH);
        api.forgetCredentials();
    }

    @Then("the payment details name the account {string} with IBAN {string} in {string}")
    public void thePaymentDetailsNameTheAccount(String accountNumber, String iban, String currency) {
        JsonNode account = api.lastResponseJson().get("account");
        assertThat(account.get("number").asString()).isEqualTo(accountNumber);
        assertThat(account.get("iban").asString()).isEqualTo(iban);
        assertThat(api.lastResponseJson().get("currency").asString()).isEqualTo(currency);
    }

    @And("the payment details send the recipient as {string}")
    public void thePaymentDetailsSendTheRecipientAs(String recipientName) {
        assertThat(api.lastResponseJson().get("account").get("recipientName").asString()).isEqualTo(recipientName);
    }

    @And("the payment details send the donation message {string} and the account verification message {string}")
    public void thePaymentDetailsSendTheMessages(String donation, String accountVerification) {
        JsonNode messages = api.lastResponseJson().get("messages");
        assertThat(messages.get("donation").asString()).isEqualTo(donation);
        assertThat(messages.get("accountVerification").asString()).isEqualTo(accountVerification);
    }

    @And("the payment details verify an account with {long} minor CZK")
    public void thePaymentDetailsVerifyAnAccountWith(long amountMinor) {
        assertThat(api.lastResponseJson().get("accountVerificationAmountMinor").asLong()).isEqualTo(amountMinor);
    }

    @And("the answer may be kept by the visitor's browser only, for {int} seconds")
    public void theAnswerMayBeKeptByTheBrowserOnly(int seconds) {
        assertThat(api.lastResponse().getHeaders().get(HttpHeaders.CACHE_CONTROL)).containsExactly("private, max-age=" + seconds);
        assertThat(api.lastResponse().getHeaders().get(HttpHeaders.PRAGMA)).isNull();
        assertThat(api.lastResponse().getHeaders().get(HttpHeaders.EXPIRES)).isNull();
    }

    @And("the answer is not stored by the browser")
    public void theAnswerIsNotStoredByTheBrowser() {
        assertThat(api.lastResponse().getHeaders().getCacheControl()).contains("no-store");
    }

    @And("the answer's ETag is the SHA-256 of its body")
    public void theAnswersEtagIsTheSha256OfItsBody() {
        String body = api.lastResponse().getBody();
        assertThat(body).isNotBlank();
        assertThat(api.lastResponse().getHeaders().getETag()).isEqualTo("\"" + sha256(body) + "\"");
    }

    @And("the answer sets no cookie")
    public void theAnswerSetsNoCookie() {
        assertThat(api.lastResponse().getHeaders().get(HttpHeaders.SET_COOKIE)).isNull();
    }

    @And("the answer has no body")
    public void theAnswerHasNoBody() {
        assertThat(api.lastResponse().getBody()).isNullOrEmpty();
    }

    @And("the answer carries the same ETag")
    public void theAnswerCarriesTheSameEtag() {
        assertThat(api.lastResponse().getHeaders().getETag()).isNotNull().isEqualTo(visitorsEtag());
    }

    @And("the answer is the visitor's answer with the same ETag")
    public void theAnswerIsTheVisitorsAnswer() {
        assertThat(api.lastResponse().getBody()).isEqualTo(visitorsAnswer.getBody());
        assertThat(api.lastResponse().getHeaders().getETag()).isNotNull().isEqualTo(visitorsAnswer.getHeaders().getETag());
    }

    private String visitorsEtag() {
        assertThat(visitorsAnswer).as("an earlier answer to the visitor").isNotNull();
        assertThat(visitorsAnswer.getHeaders().getETag()).as("the ETag of the visitor's earlier answer").isNotNull();
        return visitorsAnswer.getHeaders().getETag();
    }

    private static String sha256(String body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }
}
