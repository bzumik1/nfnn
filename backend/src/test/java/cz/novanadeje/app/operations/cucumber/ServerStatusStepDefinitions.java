package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

import static org.assertj.core.api.Assertions.assertThat;

public class ServerStatusStepDefinitions {

    private final ApiClient api;

    public ServerStatusStepDefinitions(ApiClient api) {
        this.api = api;
    }

    @When("an anonymous client asks for the server's health")
    public void anAnonymousClientAsksForTheServersHealth() {
        api.forgetCredentials();
        api.get("/actuator/health");
    }

    @When("an anonymous client asks for the server's info")
    public void anAnonymousClientAsksForTheServersInfo() {
        api.forgetCredentials();
        api.get("/actuator/info");
    }

    @Then("the server reports its status {string}")
    public void theServerReportsItsStatus(String status) {
        assertThat(api.lastResponseJson().path("status").asString()).isEqualTo(status);
    }

    @Then("the info names the revision {string}")
    public void theInfoNamesTheRevision(String revision) {
        assertThat(api.lastResponseJson().path("build").path("revision").asString()).isEqualTo(revision);
    }
}
