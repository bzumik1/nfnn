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

public class ProjectStepDefinitions {

    private static final String ADMIN_PROJECTS = "/api/admin/content/projects";
    private static final String PUBLIC_PROJECTS = "/api/content/projects";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final UploadedImages images;
    private final Map<String, String> projectIdsBySlug = new LinkedHashMap<>();

    public ProjectStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, UploadedImages images) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.images = images;
    }

    @When("{string} creates a project:")
    public void createsAProject(String alias, Map<String, String> fields) {
        sessions.actAs(alias);
        api.post(ADMIN_PROJECTS, projectBody(fields));
        rememberProject();
    }

    @When("someone without a token creates a project")
    public void someoneWithoutATokenCreatesAProject() {
        api.forgetCredentials();
        api.post(ADMIN_PROJECTS, projectBody(Map.of("title", "Titulek", "perex", "Perex.", "body", "Text.")));
    }

    @When("{string} changes the project {string}:")
    public void changesTheProject(String alias, String slug, Map<String, String> fields) {
        sessions.actAs(alias);
        api.put(ADMIN_PROJECTS + "/" + projectId(slug), projectBody(fields));
        rememberProject();
    }

    @When("{string} publishes the project {string} on {date}")
    public void publishesTheProjectOn(String alias, String slug, LocalDate publishedOn) {
        sessions.actAs(alias);
        api.post(ADMIN_PROJECTS + "/" + projectIdOrRandom(slug) + "/publish", Map.of("publishedOn", publishedOn.toString()));
    }

    @When("{string} withdraws the project {string}")
    public void withdrawsTheProject(String alias, String slug) {
        sessions.actAs(alias);
        api.post(ADMIN_PROJECTS + "/" + projectId(slug) + "/unpublish", Map.of());
    }

    @When("{string} deletes the project {string}")
    public void deletesTheProject(String alias, String slug) {
        sessions.actAs(alias);
        api.delete(ADMIN_PROJECTS + "/" + projectId(slug));
    }

    @When("{string} asks for the projects")
    public void asksForTheProjects(String alias) {
        sessions.actAs(alias);
        api.get(ADMIN_PROJECTS);
    }

    @When("{string} asks for the project {string}")
    public void asksForTheProject(String alias, String slug) {
        sessions.actAs(alias);
        api.get(ADMIN_PROJECTS + "/" + projectId(slug));
    }

    @Given("{string} has published {int} projects titled {string} from {date} on")
    public void hasPublishedProjectsTitledFromOn(String alias, int count, String title, LocalDate firstDate) {
        sessions.actAs(alias);
        for (int i = 1; i <= count; i++) {
            api.post(ADMIN_PROJECTS, projectBody(Map.of("title", title + " " + i, "perex", "Perex.", "body", "Text.")));
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(201);
            rememberProject();
            api.post(ADMIN_PROJECTS + "/" + api.lastResponseJson().get("id").asString() + "/publish",
                    Map.of("publishedOn", firstDate.plusDays(i - 1).toString()));
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("someone without a token asks for the projects")
    public void someoneWithoutATokenAsksForTheProjects() {
        api.forgetCredentials();
        api.get(PUBLIC_PROJECTS);
    }

    @When("someone without a token asks for page {int} of {int} projects")
    public void someoneWithoutATokenAsksForPageOfProjects(int page, int size) {
        api.forgetCredentials();
        api.get(PUBLIC_PROJECTS + "?page=" + page + "&size=" + size);
    }

    @When("someone without a token asks for the project {string}")
    public void someoneWithoutATokenAsksForTheProject(String slug) {
        api.forgetCredentials();
        api.get(PUBLIC_PROJECTS + "/" + slug);
    }

    @Then("the project says:")
    @Then("the project list says:")
    public void theResponseSays(Map<String, String> expected) {
        JsonNode response = api.lastResponseJson();
        expected.forEach((path, value) -> {
            JsonNode node = at(response, path);
            String actual = node == null || node.isNull() ? "" : node.asString();
            assertThat(actual).as(path).isEqualTo(images.resolve(value == null ? "" : value));
        });
    }

    @Then("the project list has {int} items")
    public void theNewsListHasItems(int count) {
        assertThat(api.lastResponseJson().get("items")).hasSize(count);
    }

    @Then("the project list titles are:")
    public void theNewsListTitlesAre(List<String> titles) {
        List<String> actual = new ArrayList<>();
        api.lastResponseJson().get("items").forEach(item -> actual.add(item.get("title").asString()));
        assertThat(actual).containsExactlyElementsOf(titles);
    }

    @Then("project list item {int} has the title {string}")
    public void newsListItemHasTheTitle(int index, String title) {
        assertThat(api.lastResponseJson().get("items").get(index).get("title").asString()).isEqualTo(title);
    }

    @Then("the admin action {string} by {string} on the project {string} is recorded with details containing {string}")
    public void theAdminActionByOnTheProjectIsRecordedWithDetailsContaining(String action, String alias, String slug, String details) {
        List<String> recorded = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id = ?")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .param(UUID.fromString(projectId(slug)))
                .query(String.class)
                .list();
        assertThat(recorded).singleElement().asString().contains(details);
    }

    private Map<String, Object> projectBody(Map<String, String> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", text(fields.get("title")));
        body.put("year", fields.containsKey("year") ? Integer.parseInt(fields.get("year")) : 2024);
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
        return body;
    }

    private void rememberProject() {
        if (api.lastResponse().getStatusCode().is2xxSuccessful()) {
            JsonNode project = api.lastResponseJson();
            projectIdsBySlug.put(project.get("slug").asString(), project.get("id").asString());
        }
    }

    private String projectId(String slug) {
        String id = projectIdsBySlug.get(slug);
        if (id == null) {
            throw new IllegalArgumentException("No project \"" + slug + "\" in this scenario; known: " + projectIdsBySlug.keySet());
        }
        return id;
    }

    private String projectIdOrRandom(String slug) {
        return projectIdsBySlug.getOrDefault(slug, UUID.randomUUID().toString());
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
