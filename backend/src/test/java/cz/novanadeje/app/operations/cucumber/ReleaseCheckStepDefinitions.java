package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.operations.application.release.LatestReleaseUnavailable;
import cz.novanadeje.app.operations.application.release.ReleaseCheckService;
import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.support.FakeLatestReleaseSource;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class ReleaseCheckStepDefinitions {

    private static final String RELEASE = "/api/admin/operations/release";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final FakeLatestReleaseSource source;
    private final ReleaseCheckService checks;

    public ReleaseCheckStepDefinitions(ApiClient api, DonorSessions sessions, FakeLatestReleaseSource source, ReleaseCheckService checks) {
        this.api = api;
        this.sessions = sessions;
        this.source = source;
        this.checks = checks;
    }

    @Given("GitHub publishes the release {string} at {string}")
    public void gitHubPublishesTheReleaseAt(String release, String publishedAt) {
        source.publish(new LatestRelease(Release.parse(release).orElseThrow(), Instant.parse(publishedAt)));
    }

    @Given("GitHub answers the release check with status {int}")
    public void gitHubAnswersTheReleaseCheckWithStatus(int status) {
        source.failWith(LatestReleaseUnavailable.status(status));
    }

    @When("the server checks for the latest release")
    public void theServerChecksForTheLatestRelease() {
        checks.check();
    }

    @When("{string} asks for the release")
    public void asksForTheRelease(String alias) {
        sessions.actAs(alias);
        api.get(RELEASE);
    }

    @When("someone without a token asks for the release")
    public void someoneWithoutATokenAsksForTheRelease() {
        api.forgetCredentials();
        api.get(RELEASE);
    }

    @Then("the release answer says:")
    public void theReleaseAnswerSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> assertThat(at(response, path).asString()).as(path).isEqualTo(value));
    }

    @Then("the release answer has no {string}")
    public void theReleaseAnswerHasNo(String field) {
        JsonNode value = api.lastResponseJson().get(field);
        assertThat(value == null || value.isNull()).as(field).isTrue();
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String part : path.split("\\.")) {
            current = current.path(part);
        }
        return current;
    }
}
