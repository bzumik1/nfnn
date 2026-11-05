package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.SynchronousBankImportRequests;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminHistoryImportStepDefinitions {

    private static final String PATH = "/api/admin/donations/import/history";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final SynchronousBankImportRequests imports;
    private final MutableClock clock;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private String exchangedApiToken;

    public AdminHistoryImportStepDefinitions(ApiClient api, DonorSessions sessions, SynchronousBankImportRequests imports, MutableClock clock,
                                             ScenarioDonors scenarioDonors, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.imports = imports;
        this.clock = clock;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
    }

    @Given("the bank import is off")
    public void theBankImportIsOff() {
        imports.turnOff();
    }

    @When("the exchanged API token asks for older bank payments from {date}")
    public void theExchangedApiTokenAsksForOlderBankPaymentsFrom(LocalDate from) {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has("access_token")) {
            exchangedApiToken = last.get("access_token").asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
        api.post(PATH, Map.of("from", from.toString()));
    }

    @Then("the admin action {string} by {string} is recorded {int} times")
    public void theAdminActionByIsRecordedTimes(String action, String alias, int times) {
        assertThat(jdbc.sql("select count(*) from admin_action where action = ? and admin_id = ?")
                .param(action).param(scenarioDonors.idOf(alias)).query(Long.class).single()).isEqualTo(times);
    }

    @Then("the admin action {string} by {string} came through {string}")
    public void theAdminActionByCameThrough(String action, String alias, String client) {
        assertThat(jdbc.sql("select client from admin_action where action = ? and admin_id = ?")
                .param(action).param(scenarioDonors.idOf(alias)).query(String.class).list()).singleElement().asString().contains(client);
    }

    @When("{string} asks for older bank payments from {date}")
    public void asksForOlderBankPaymentsFrom(String alias, LocalDate from) {
        sessions.actAs(alias);
        api.post(PATH, Map.of("from", from.toString()));
    }

    @When("{string} asks for older bank payments from {date} {int} times")
    public void asksForOlderBankPaymentsFromTimes(String alias, LocalDate from, int times) {
        for (int request = 0; request < times; request++) {
            asksForOlderBankPaymentsFrom(alias, from);
        }
    }

    @When("{string} asks for older bank payments without a day")
    public void asksForOlderBankPaymentsWithoutADay(String alias) {
        sessions.actAs(alias);
        api.post(PATH, Map.of());
    }

    @When("someone without a token asks for older bank payments from {date}")
    public void someoneWithoutATokenAsksForOlderBankPaymentsFrom(LocalDate from) {
        api.forgetCredentials();
        api.post(PATH, Map.of("from", from.toString()));
    }

    @When("the queued history import runs")
    public void theQueuedHistoryImportRuns() {
        Instant at = imports.queuedHistoryImportAt().orElseThrow(() -> new AssertionError("No history import is queued"));
        if (clock.instant().isBefore(at)) {
            clock.set(at);
        }
        imports.runQueuedHistoryImport();
    }

    @Then("the history import says:")
    public void theHistoryImportSays(Map<String, String> expected) {
        JsonNode answer = api.lastResponseJson();
        expected.forEach((field, value) -> {
            assertThat(answer.get(field)).as(field).isNotNull();
            assertThat(answer.get(field).asString()).as(field).isEqualTo(value);
        });
    }
}
