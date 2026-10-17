package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.Before;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
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

    @When("{int} minutes pass")
    public void minutesPass(int minutes) {
        clock.advance(Duration.ofMinutes(minutes));
    }

    @Then("the response status is {int}")
    public void theResponseStatusIs(int status) {
        assertThat(api.lastResponse().getStatusCode().value())
                .withFailMessage("Expected status %d but got %d with body %s", status, api.lastResponse().getStatusCode().value(), api.lastResponse().getBody())
                .isEqualTo(status);
    }

    @Then("the problem type ends with {string}")
    public void theProblemTypeEndsWith(String suffix) {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        assertThat(api.lastResponseJson().get("type").asString()).endsWith(suffix);
    }

    @Then("the problem lists errors for fields {string} and {string}")
    public void theProblemListsErrorsForFields(String first, String second) {
        assertThat(errorFields()).contains(first, second);
    }

    @Then("the problem lists an error for field {string}")
    public void theProblemListsAnErrorForField(String field) {
        assertThat(errorFields()).contains(field);
    }

    private List<String> errorFields() {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        JsonNode errors = api.lastResponseJson().get("errors");
        assertThat(errors).withFailMessage("No errors in %s", api.lastResponse().getBody()).isNotNull();
        return errors.valueStream().map(error -> error.get("field").asString()).toList();
    }
}
