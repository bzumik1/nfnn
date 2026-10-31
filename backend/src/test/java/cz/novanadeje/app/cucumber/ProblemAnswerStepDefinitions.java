package cz.novanadeje.app.cucumber;

import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

public class ProblemAnswerStepDefinitions {

    private static final String INSTANCE = "instance";

    private final ApiClient api;
    private final DonorSessions sessions;

    public ProblemAnswerStepDefinitions(ApiClient api, DonorSessions sessions) {
        this.api = api;
        this.sessions = sessions;
    }

    @When("{string} sends {word} {string} as {string} with the body {string}")
    public void sendsAsWithTheBody(String alias, String method, String path, String contentType, String body) {
        sessions.actAs(alias);
        api.send(method, path, contentType, body);
    }

    @When("the signed-in donor sends {word} {string} as {string} with the body {string}")
    public void theSignedInDonorSendsAsWithTheBody(String method, String path, String contentType, String body) {
        api.send(method, path, contentType, body);
    }

    @Then("the problem says {string}: {string}")
    public void theProblemSays(String title, String detail) {
        assertThat(api.lastResponse().getHeaders().getContentType()).hasToString("application/problem+json");
        assertThat(api.lastResponseJson().get("title").asString()).isEqualTo(title);
        assertThat(api.lastResponseJson().get("detail").asString()).isEqualTo(detail);
    }

    @Then("the answer is stored nowhere and not sniffed")
    public void theAnswerIsStoredNowhereAndNotSniffed() {
        assertThat(api.lastResponse().getHeaders().getCacheControl()).contains("no-store");
        assertThat(api.lastResponse().getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
    }

    @Then("the problem does not repeat {string}")
    public void theProblemDoesNotRepeat(String sent) {
        JsonNode problem = api.lastResponseJson();
        assertThat(problem.propertyNames()).isNotEmpty();
        problem.propertyNames().stream()
                .filter(field -> !INSTANCE.equals(field))
                .forEach(field -> assertThat(problem.get(field).toString()).as(field).doesNotContainIgnoringCase(sent));
    }
}
