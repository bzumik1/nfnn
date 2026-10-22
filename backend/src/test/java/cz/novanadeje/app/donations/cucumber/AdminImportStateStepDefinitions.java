package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminImportStateStepDefinitions {

    private static final String PATH = "/api/admin/donations/import-state";

    private final ApiClient api;
    private final DonorSessions sessions;

    public AdminImportStateStepDefinitions(ApiClient api, DonorSessions sessions) {
        this.api = api;
        this.sessions = sessions;
    }

    @When("{string} asks for the import state")
    public void asksForTheImportState(String alias) {
        sessions.actAs(alias);
        api.get(PATH);
    }

    @When("someone without a token asks for the import state")
    public void someoneWithoutATokenAsksForTheImportState() {
        api.forgetCredentials();
        api.get(PATH);
    }

    @Then("the import state says:")
    public void theImportStateSays(Map<String, String> expected) {
        JsonNode state = api.lastResponseJson();
        expected.forEach((path, value) -> assertThat(at(state, path).asString()).as(path).isEqualTo(value));
    }

    @Then("the import state has no coverage, no attempt and no outage")
    public void theImportStateHasNoCoverageNoAttemptAndNoOutage() {
        JsonNode state = api.lastResponseJson();
        assertThat(state.get("coveredFrom").isNull()).isTrue();
        assertThat(state.get("coveredTo").isNull()).isTrue();
        assertThat(state.get("lastAttemptedAt").isNull()).isTrue();
        assertThat(state.get("lastSucceededAt").isNull()).isTrue();
        assertThat(state.get("lastFailure").isNull()).isTrue();
        assertThat(state.get("consecutiveFailures").asInt()).isZero();
        assertThat(state.get("reportedOutage").isNull()).isTrue();
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String segment : path.split("\\.")) {
            current = current.get(segment);
            assertThat(current).as(path).isNotNull();
        }
        return current;
    }
}
