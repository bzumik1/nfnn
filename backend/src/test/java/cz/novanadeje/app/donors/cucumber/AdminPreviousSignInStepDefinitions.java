package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminPreviousSignInStepDefinitions {

    private static final String PREVIOUS_SIGN_IN = "/api/admin/donors/me/previous-sign-in";

    private final ApiClient api;
    private final DonorSessions sessions;

    public AdminPreviousSignInStepDefinitions(ApiClient api, DonorSessions sessions) {
        this.api = api;
        this.sessions = sessions;
    }

    @When("{string} asks for her/his previous sign-in")
    public void asksForThePreviousSignIn(String alias) {
        sessions.actAs(alias);
        api.get(PREVIOUS_SIGN_IN);
    }

    @When("someone without a token asks for the previous sign-in")
    public void someoneWithoutATokenAsksForThePreviousSignIn() {
        api.forgetCredentials();
        api.get(PREVIOUS_SIGN_IN);
    }

    @Then("there is no previous sign-in")
    public void thereIsNoPreviousSignIn() {
        assertThat(api.lastResponseJson().get("previousSignInAt").isNull()).isTrue();
    }

    @Then("the previous sign-in was at {string}")
    public void thePreviousSignInWasAt(String instant) {
        assertThat(api.lastResponseJson().get("previousSignInAt").asString()).isEqualTo(instant);
    }
}
