package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.donations.application.bankcode.BankCodeRefreshService;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceUnavailable;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import cz.novanadeje.app.support.FakeBankCodeSource;
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
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

public class BankCodesStepDefinitions {

    private static final String BANK_CODES = "/api/donations/bank-codes";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;
    private final FakeBankCodeSource source;
    private final BankCodeRefreshService refreshes;
    private Optional<String> failure = Optional.empty();

    public BankCodesStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc, FakeBankCodeSource source, BankCodeRefreshService refreshes) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.source = source;
        this.refreshes = refreshes;
    }

    @Given("the ČNB publishes {int} bank codes last modified {string}")
    public void theCnbPublishesBankCodes(int count, String lastModified) {
        source.publish(new BankCodeList(IntStream.range(0, count)
                .mapToObj(index -> new CzechBank(new BankCode("%04d".formatted(index)), new BankName("Banka %d, a.s.".formatted(index))))
                .toList()), lastModified);
    }

    @When("the ČNB answers the bank codes with status {int}")
    public void theCnbAnswersWithStatus(int status) {
        source.failWith(BankCodeSourceUnavailable.status(status));
    }

    @When("the bank code list is refreshed")
    public void theBankCodeListIsRefreshed() {
        try {
            refreshes.refresh();
            failure = Optional.empty();
        } catch (BankCodeSourceUnavailable unavailable) {
            failure = Optional.of(unavailable.outcome());
        }
    }

    @Then("the bank code refresh failed with status {int}")
    public void theBankCodeRefreshFailedWithStatus(int status) {
        assertThat(failure).contains("status " + status);
    }

    @Then("the ČNB was asked whether the list changed since {string}")
    public void theCnbWasAskedSince(String lastModified) {
        assertThat(source.askedIfModifiedSince()).last().isEqualTo(Optional.of(lastModified));
    }

    @Then("the bank code list was last checked at {string}")
    public void theBankCodeListWasLastCheckedAt(String checkedAt) {
        assertThat(jdbc.sql("select checked_at from bank_code_list_state").query(Timestamp.class).single().toInstant())
                .isEqualTo(Instant.parse(checkedAt));
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

    @Then("the bank codes fetched at {string} are {int}, from {string} {string} to {string} {string}")
    public void theBankCodesRange(String fetchedAt, int count, String firstCode, String firstName, String lastCode, String lastName) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("fetchedAt").asString()).isEqualTo(fetchedAt);
        List<JsonNode> items = answer.get("items").values().stream().toList();
        assertThat(items).hasSize(count);
        assertThat(List.of(items.getFirst().get("code").asString(), items.getFirst().get("name").asString())).containsExactly(firstCode, firstName);
        assertThat(List.of(items.getLast().get("code").asString(), items.getLast().get("name").asString())).containsExactly(lastCode, lastName);
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
