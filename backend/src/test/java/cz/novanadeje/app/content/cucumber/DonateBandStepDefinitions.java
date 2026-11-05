package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class DonateBandStepDefinitions {

    private static final String ADMIN_DONATE_BAND = "/api/admin/content/donate-band";
    private static final String ACCESS_TOKEN = "access_token";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final UploadedImages images;
    private String exchangedApiToken;

    public DonateBandStepDefinitions(ApiClient api, DonorSessions sessions, UploadedImages images) {
        this.api = api;
        this.sessions = sessions;
        this.images = images;
    }

    @When("{string} asks for the donate band")
    public void asksForTheDonateBand(String alias) {
        sessions.actAs(alias);
        api.get(ADMIN_DONATE_BAND);
    }

    @When("{string} sets the donate band photo:")
    public void setsTheDonateBandPhoto(String alias, Map<String, String> fields) {
        sessions.actAs(alias);
        api.put(ADMIN_DONATE_BAND, bandBody(fields));
    }

    @When("{string} removes the donate band photo")
    public void removesTheDonateBandPhoto(String alias) {
        sessions.actAs(alias);
        api.put(ADMIN_DONATE_BAND, bandBody(Map.of()));
    }

    @When("someone without a token removes the donate band photo")
    public void someoneWithoutATokenRemovesTheDonateBandPhoto() {
        api.forgetCredentials();
        api.put(ADMIN_DONATE_BAND, bandBody(Map.of()));
    }

    @When("the exchanged API token asks for the donate band")
    public void theExchangedApiTokenAsksForTheDonateBand() {
        actAsExchangedApiToken();
        api.get(ADMIN_DONATE_BAND);
    }

    @When("the exchanged API token sets the donate band photo:")
    public void theExchangedApiTokenSetsTheDonateBandPhoto(Map<String, String> fields) {
        actAsExchangedApiToken();
        api.put(ADMIN_DONATE_BAND, bandBody(fields));
    }

    @When("the exchanged API token removes the donate band photo")
    public void theExchangedApiTokenRemovesTheDonateBandPhoto() {
        actAsExchangedApiToken();
        api.put(ADMIN_DONATE_BAND, bandBody(Map.of()));
    }

    @Then("the donate band has no photo")
    public void theDonateBandHasNoPhoto() {
        assertThat(api.lastResponseJson().get("photo").isNull()).isTrue();
    }

    @Then("the donate band says:")
    public void theDonateBandSays(Map<String, String> expected) {
        assertFields(api.lastResponseJson(), expected);
    }

    @Then("the home donate band has no photo")
    public void theHomeDonateBandHasNoPhoto() {
        assertThat(api.lastResponseJson().get("donateBand").get("photo").isNull()).isTrue();
    }

    @Then("the home donate band says:")
    public void theHomeDonateBandSays(Map<String, String> expected) {
        assertFields(api.lastResponseJson().get("donateBand"), expected);
    }

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }

    private Map<String, Object> bandBody(Map<String, String> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("photoId", fields.containsKey("photo") ? images.resolve(fields.get("photo")) : null);
        body.put("photoAlt", fields.get("alt"));
        return body;
    }

    private void assertFields(JsonNode response, Map<String, String> expected) {
        expected.forEach((path, value) -> {
            JsonNode node = at(response, path);
            String actual = node == null || node.isNull() ? "" : node.asString();
            assertThat(actual).as(path).isEqualTo(images.resolve(value == null ? "" : value));
        });
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String segment : path.split("\\.")) {
            if (current == null || current.isNull()) {
                return null;
            }
            current = current.get(segment);
        }
        return current;
    }
}
