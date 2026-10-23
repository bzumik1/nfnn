package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class NewsStepDefinitions {

    private static final String ADMIN_NEWS = "/api/admin/content/news";
    private static final String PUBLIC_NEWS = "/api/content/news";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final UploadedImages images;
    private final Map<String, String> articleIdsBySlug = new LinkedHashMap<>();

    public NewsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, UploadedImages images) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.images = images;
    }

    @When("{string} creates a news article:")
    public void createsANewsArticle(String alias, Map<String, String> fields) {
        sessions.actAs(alias);
        api.post(ADMIN_NEWS, articleBody(fields));
        rememberArticle();
    }

    @When("someone without a token creates a news article")
    public void someoneWithoutATokenCreatesANewsArticle() {
        api.forgetCredentials();
        api.post(ADMIN_NEWS, articleBody(Map.of("title", "Titulek", "perex", "Perex.", "body", "Text.")));
    }

    @When("{string} changes the news article {string}:")
    public void changesTheNewsArticle(String alias, String slug, Map<String, String> fields) {
        sessions.actAs(alias);
        api.put(ADMIN_NEWS + "/" + articleId(slug), articleBody(fields));
        rememberArticle();
    }

    @When("{string} publishes the news article {string} on {date}")
    public void publishesTheNewsArticleOn(String alias, String slug, LocalDate publishedOn) {
        sessions.actAs(alias);
        api.post(ADMIN_NEWS + "/" + articleIdOrRandom(slug) + "/publish", Map.of("publishedOn", publishedOn.toString()));
    }

    @When("{string} withdraws the news article {string}")
    public void withdrawsTheNewsArticle(String alias, String slug) {
        sessions.actAs(alias);
        api.post(ADMIN_NEWS + "/" + articleId(slug) + "/unpublish", Map.of());
    }

    @When("{string} deletes the news article {string}")
    public void deletesTheNewsArticle(String alias, String slug) {
        sessions.actAs(alias);
        api.delete(ADMIN_NEWS + "/" + articleId(slug));
    }

    @When("{string} asks for the news articles")
    public void asksForTheNewsArticles(String alias) {
        sessions.actAs(alias);
        api.get(ADMIN_NEWS);
    }

    @When("{string} asks for the news article {string}")
    public void asksForTheNewsArticle(String alias, String slug) {
        sessions.actAs(alias);
        api.get(ADMIN_NEWS + "/" + articleId(slug));
    }

    @Given("{string} has published {int} news articles titled {string} from {date} on")
    public void hasPublishedNewsArticlesTitledFromOn(String alias, int count, String title, LocalDate firstDate) {
        sessions.actAs(alias);
        for (int i = 1; i <= count; i++) {
            api.post(ADMIN_NEWS, articleBody(Map.of("title", title + " " + i, "perex", "Perex.", "body", "Text.")));
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(201);
            rememberArticle();
            api.post(ADMIN_NEWS + "/" + api.lastResponseJson().get("id").asString() + "/publish",
                    Map.of("publishedOn", firstDate.plusDays(i - 1).toString()));
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("someone without a token asks for the news articles")
    public void someoneWithoutATokenAsksForTheNewsArticles() {
        api.forgetCredentials();
        api.get(PUBLIC_NEWS);
    }

    @When("someone without a token asks for page {int} of {int} news articles")
    public void someoneWithoutATokenAsksForPageOfNewsArticles(int page, int size) {
        api.forgetCredentials();
        api.get(PUBLIC_NEWS + "?page=" + page + "&size=" + size);
    }

    @When("someone without a token asks for the news article {string}")
    public void someoneWithoutATokenAsksForTheNewsArticle(String slug) {
        api.forgetCredentials();
        api.get(PUBLIC_NEWS + "/" + slug);
    }

    @Then("the news article says:")
    @Then("the news list says:")
    public void theResponseSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> {
            JsonNode node = at(response, path);
            String actual = node == null || node.isNull() ? "" : node.asString();
            assertThat(actual).as(path).isEqualTo(images.resolve(value == null ? "" : value));
        });
    }

    @Then("the news list has {int} items")
    public void theNewsListHasItems(int count) {
        assertThat(api.lastResponseJson().get("items")).hasSize(count);
    }

    @Then("the news list titles are:")
    public void theNewsListTitlesAre(List<String> titles) {
        List<String> actual = new ArrayList<>();
        api.lastResponseJson().get("items").forEach(item -> actual.add(item.get("title").asString()));
        assertThat(actual).containsExactlyElementsOf(titles);
    }

    @Then("news list item {int} has the title {string}")
    public void newsListItemHasTheTitle(int index, String title) {
        assertThat(api.lastResponseJson().get("items").get(index).get("title").asString()).isEqualTo(title);
    }

    @Then("the admin action {string} by {string} on the news article {string} is recorded with details containing {string}")
    public void theAdminActionByOnTheNewsArticleIsRecordedWithDetailsContaining(String action, String alias, String slug, String details) {
        List<String> recorded = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id = ?")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .param(UUID.fromString(articleId(slug)))
                .query(String.class)
                .list();
        assertThat(recorded).singleElement().asString().contains(details);
    }

    private Map<String, Object> articleBody(Map<String, String> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", text(fields.get("title")));
        body.put("perex", text(fields.get("perex")));
        body.put("body", text(fields.get("body")));
        if (fields.containsKey("slug")) {
            body.put("slug", fields.get("slug"));
        }
        if (fields.containsKey("tag")) {
            body.put("tag", fields.get("tag"));
        }
        if (fields.containsKey("coverImage")) {
            body.put("coverImageId", images.resolve(fields.get("coverImage")));
        }
        if (fields.containsKey("coverImageAlt")) {
            body.put("coverImageAlt", fields.get("coverImageAlt"));
        }
        return body;
    }

    private void rememberArticle() {
        if (api.lastResponse().getStatusCode().is2xxSuccessful()) {
            JsonNode article = api.lastResponseJson();
            articleIdsBySlug.put(article.get("slug").asString(), article.get("id").asString());
        }
    }

    private String articleId(String slug) {
        String id = articleIdsBySlug.get(slug);
        if (id == null) {
            throw new IllegalArgumentException("No news article \"" + slug + "\" in this scenario; known: " + articleIdsBySlug.keySet());
        }
        return id;
    }

    private String articleIdOrRandom(String slug) {
        return articleIdsBySlug.getOrDefault(slug, UUID.randomUUID().toString());
    }

    private static String text(String cell) {
        return cell == null ? "" : cell.replace("\\n", "\n");
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String segment : path.split("\\.")) {
            if (current == null || current.isNull()) {
                return null;
            }
            current = segment.chars().allMatch(Character::isDigit) ? current.get(Integer.parseInt(segment)) : current.get(segment);
        }
        return current;
    }
}
