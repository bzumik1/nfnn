package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class AboutStepDefinitions {

    private static final String ADMIN_ABOUT = "/api/admin/content/about";
    private static final String ACCESS_TOKEN = "access_token";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final UploadedImages images;
    private String exchangedApiToken;

    public AboutStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, UploadedImages images) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.images = images;
    }

    @When("{string} asks for the About section")
    public void asksForTheAboutSection(String alias) {
        sessions.actAs(alias);
        api.get(ADMIN_ABOUT);
    }

    @When("{string} sets the About photo:")
    public void setsTheAboutPhoto(String alias, Map<String, String> fields) {
        sessions.actAs(alias);
        api.put(ADMIN_ABOUT, aboutBody(fields));
    }

    @When("{string} removes the About photo")
    public void removesTheAboutPhoto(String alias) {
        sessions.actAs(alias);
        api.put(ADMIN_ABOUT, aboutBody(Map.of()));
    }

    @When("someone without a token removes the About photo")
    public void someoneWithoutATokenRemovesTheAboutPhoto() {
        api.forgetCredentials();
        api.put(ADMIN_ABOUT, aboutBody(Map.of()));
    }

    @When("the exchanged API token asks for the About section")
    public void theExchangedApiTokenAsksForTheAboutSection() {
        actAsExchangedApiToken();
        api.get(ADMIN_ABOUT);
    }

    @When("the exchanged API token sets the About photo:")
    public void theExchangedApiTokenSetsTheAboutPhoto(Map<String, String> fields) {
        actAsExchangedApiToken();
        api.put(ADMIN_ABOUT, aboutBody(fields));
    }

    @When("the exchanged API token removes the About photo")
    public void theExchangedApiTokenRemovesTheAboutPhoto() {
        actAsExchangedApiToken();
        api.put(ADMIN_ABOUT, aboutBody(Map.of()));
    }

    @Then("the About section has no photo")
    public void theAboutSectionHasNoPhoto() {
        assertThat(api.lastResponseJson().get("photo").isNull()).isTrue();
    }

    @Then("the About section says:")
    public void theAboutSectionSays(Map<String, String> expected) {
        assertFields(api.lastResponseJson(), expected);
    }

    @Then("the home About section has no photo")
    public void theHomeAboutSectionHasNoPhoto() {
        assertThat(api.lastResponseJson().get("about").get("photo").isNull()).isTrue();
    }

    @Then("the home About section says:")
    public void theHomeAboutSectionSays(Map<String, String> expected) {
        assertFields(api.lastResponseJson().get("about"), expected);
    }

    @Then("the admin action {string} by {string} on the image uploaded as {string} is recorded with details containing {string}")
    public void theAdminActionByOnTheImageIsRecordedWithDetailsContaining(String action, String alias, String fileName, String details) {
        List<String> recorded = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id is null")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .query(String.class)
                .list();
        String photo = images.idOf(fileName);
        assertThat(recorded).filteredOn(recordedDetails -> recordedDetails.contains(photo) && recordedDetails.contains(details)).hasSize(1);
    }

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }

    private Map<String, Object> aboutBody(Map<String, String> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("photoId", fields.containsKey("photo") ? images.resolve(fields.get("photo")) : null);
        body.put("photoAlt", fields.get("alt"));
        body.put("caption", fields.get("caption"));
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
