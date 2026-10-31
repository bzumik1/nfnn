package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProofMessage;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class ReceiptStatusStepDefinitions {

    private static final String STATUS_PATH = "/api/donations/receipts/status";
    private static final List<String> LIQUIBASE_TABLES = List.of("databasechangelog", "databasechangeloglock");

    private final ApiClient api;
    private final JdbcClient jdbc;
    private final FoundationIdentity foundation;
    private Map<String, String> notedDatabase = Map.of();

    public ReceiptStatusStepDefinitions(ApiClient api, JdbcClient jdbc, FoundationIdentity foundation) {
        this.api = api;
        this.jdbc = jdbc;
        this.foundation = foundation;
    }

    @When("a visitor asks the status of receipt {string}")
    public void aVisitorAsksTheStatusOfReceipt(String number) {
        aVisitorAsksTheStatusOfTheDigest(statusDigestOf(number, true));
    }

    @When("a visitor asked the status of receipt {string} {int} times")
    public void aVisitorAskedTheStatusOfReceiptTimes(String number, int times) {
        for (int question = 0; question < times; question++) {
            aVisitorAsksTheStatusOfReceipt(number);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("a visitor asks the status of receipt {string} by its signed message alone")
    public void aVisitorAsksTheStatusOfReceiptByItsSignedMessageAlone(String number) {
        aVisitorAsksTheStatusOfTheDigest(statusDigestOf(number, false));
    }

    @When("a visitor asks the status of the digest {string}")
    public void aVisitorAsksTheStatusOfTheDigest(String digest) {
        api.forgetCredentials();
        api.post(STATUS_PATH, Map.of("digest", digest));
    }

    @When("a visitor asks the status of a digest of {int} hex digits")
    public void aVisitorAsksTheStatusOfADigestOfHexDigits(int digits) {
        aVisitorAsksTheStatusOfTheDigest("a".repeat(digits));
    }

    @When("a visitor asks the status without a digest")
    public void aVisitorAsksTheStatusWithoutADigest() {
        api.forgetCredentials();
        api.post(STATUS_PATH, Map.of());
    }

    @Given("receipt {string} was withdrawn")
    public void receiptWasWithdrawn(String number) {
        assertThat(jdbc.sql("update issued_receipt set status = 'WITHDRAWN' where number = ? and status = 'ACTIVE'").param(number).update()).isEqualTo(1);
    }

    @Given("the database is noted as it stands")
    public void theDatabaseIsNotedAsItStands() {
        notedDatabase = databaseContents();
    }

    @Then("the database is as it was noted")
    public void theDatabaseIsAsItWasNoted() {
        assertThat(notedDatabase).as("the database was noted before").isNotEmpty();
        assertThat(databaseContents()).isEqualTo(notedDatabase);
    }

    @Then("the receipt status is {string}")
    public void theReceiptStatusIs(String status) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.propertyNames()).containsExactly("status");
        assertThat(answer.get("status").asString()).isEqualTo(status);
    }

    @Then("the status answer is kept by no cache")
    public void theStatusAnswerIsKeptByNoCache() {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getContentType()).hasToString("application/json");
        assertThat(headers.get(HttpHeaders.CACHE_CONTROL)).containsExactly("no-store");
        assertThat(headers.get(HttpHeaders.SET_COOKIE)).isNull();
    }

    private String statusDigestOf(String number, boolean withSignature) {
        byte[] proof = jdbc.sql("select proof from issued_receipt where number = ?").param(number).query(byte[].class).single();
        byte[] body = Arrays.copyOf(proof, proof.length - ReceiptProof.SIGNATURE_BYTES);
        byte[] signature = Arrays.copyOfRange(proof, body.length, proof.length);
        MessageDigest sha256 = sha256();
        sha256.update(ReceiptProofMessage.of(foundation.companyIdentifier(), body));
        if (withSignature) {
            sha256.update(signature);
        }
        return HexFormat.of().formatHex(sha256.digest());
    }

    private Map<String, String> databaseContents() {
        Map<String, String> contents = new LinkedHashMap<>();
        jdbc.sql("select tablename from pg_tables where schemaname = 'public' order by tablename").query(String.class).list().stream()
                .filter(table -> !LIQUIBASE_TABLES.contains(table))
                .forEach(table -> contents.put(table, jdbc.sql("select coalesce(md5(string_agg(t::text, '|' order by t::text)), '') from " + table + " t")
                        .query(String.class).single()));
        return contents;
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }
}
