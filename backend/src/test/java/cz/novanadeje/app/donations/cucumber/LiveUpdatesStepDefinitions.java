package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import io.cucumber.java.en.When;

public class LiveUpdatesStepDefinitions {

    private static final String LIVE = "/api/live";

    private final ApiClient api;

    public LiveUpdatesStepDefinitions(ApiClient api) {
        this.api = api;
    }

    @When("someone without a token opens the live stream")
    public void someoneWithoutATokenOpensTheLiveStream() {
        api.forgetCredentials();
        api.get(LIVE);
    }
}
