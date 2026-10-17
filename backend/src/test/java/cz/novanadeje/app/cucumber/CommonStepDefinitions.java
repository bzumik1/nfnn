package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.Before;
import io.cucumber.java.en.Then;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public class CommonStepDefinitions {

    private final ApiClient api;
    private final RecordingMailSender mailSender;
    private final MutableClock clock;

    public CommonStepDefinitions(ApiClient api, RecordingMailSender mailSender, MutableClock clock) {
        this.api = api;
        this.mailSender = mailSender;
        this.clock = clock;
    }

    @Before
    public void isolateScenario() {
        mailSender.clear();
        clock.advance(Duration.ofDays(1));
    }

    @Then("the response status is {int}")
    public void theResponseStatusIs(int status) {
        assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(status);
    }

    @Then("the problem type ends with {string}")
    public void theProblemTypeEndsWith(String suffix) {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        assertThat(api.lastResponseJson().get("type").asString()).endsWith(suffix);
    }

    @Then("the problem lists errors for fields {string} and {string}")
    public void theProblemListsErrorsForFields(String first, String second) {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        JsonNode errors = api.lastResponseJson().get("errors");
        List<String> fields = errors.valueStream().map(error -> error.get("field").asString()).toList();
        assertThat(fields).contains(first, second);
    }
}
