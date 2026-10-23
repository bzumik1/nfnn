package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public class HomeStepDefinitions {

    private static final String HOME = "/api/content/home";

    private final ApiClient api;

    public HomeStepDefinitions(ApiClient api) {
        this.api = api;
    }

    @When("someone without a token asks for the home content")
    public void someoneWithoutATokenAsksForTheHomeContent() {
        api.forgetCredentials();
        api.get(HOME);
    }

    @Then("the home news titles are:")
    public void theHomeNewsTitlesAre(List<String> titles) {
        assertThat(titles("news")).containsExactlyElementsOf(titles);
    }

    @Then("the home project titles are:")
    public void theHomeProjectTitlesAre(List<String> titles) {
        assertThat(titles("projects")).containsExactlyElementsOf(titles);
    }

    @Then("the home content has {int} news articles and {int} projects")
    public void theHomeContentHasNewsArticlesAndProjects(int news, int projects) {
        assertThat(api.lastResponseJson().get("news")).hasSize(news);
        assertThat(api.lastResponseJson().get("projects")).hasSize(projects);
    }

    private List<String> titles(String field) {
        List<String> actual = new ArrayList<>();
        api.lastResponseJson().get(field).forEach(item -> actual.add(item.get("title").asString()));
        return actual;
    }
}
