package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class BankCodesStepDefinitions {

    private static final String BANK_CODES = "/api/donations/bank-codes";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;

    public BankCodesStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
    }

    @Given("the bank code list fetched at {string} holds:")
    public void theBankCodeListHolds(String fetchedAt, DataTable banks) {
        for (Map<String, String> bank : banks.asMaps()) {
            jdbc.sql("insert into bank_code (code, name) values (?, ?)").params(bank.get("code"), bank.get("name")).update();
        }
        Timestamp at = Timestamp.from(Instant.parse(fetchedAt));
        jdbc.sql("insert into bank_code_list_state (id, fetched_at, source_last_modified, checked_at) values (1, ?, ?, ?)")
                .params(at, "Fri, 25 Sep 2026 11:10:55 GMT", at).update();
    }

    @When("{string} asks for the bank codes")
    public void asksForTheBankCodes(String alias) {
        sessions.actAs(alias);
        api.get(BANK_CODES);
    }

    @When("someone without a token asks for the bank codes")
    public void someoneWithoutATokenAsksForTheBankCodes() {
        api.forgetCredentials();
        api.get(BANK_CODES);
    }

    @Then("the bank codes were never fetched and none are listed")
    public void theBankCodesWereNeverFetched() {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("fetchedAt").isNull()).isTrue();
        assertThat(answer.get("items").isEmpty()).isTrue();
    }

    @Then("the bank codes fetched at {string} are:")
    public void theBankCodesAre(String fetchedAt, DataTable expected) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("fetchedAt").asString()).isEqualTo(fetchedAt);
        List<Map<String, String>> items = answer.get("items").values().stream()
                .map(item -> Map.of("code", item.get("code").asString(), "name", item.get("name").asString()))
                .toList();
        assertThat(items).isEqualTo(expected.asMaps());
    }
}
