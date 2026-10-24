package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminActionsStepDefinitions {

    private static final String ACTIONS_PATH = "/api/admin/donors/actions";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final Clock clock;

    public AdminActionsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, Clock clock) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @When("{string} asks for the admin actions")
    public void asksForTheAdminActions(String alias) {
        sessions.actAs(alias);
        api.get(ACTIONS_PATH);
    }

    @When("{string} asks for the admin actions in {string}")
    public void asksForTheAdminActionsIn(String alias, String language) {
        sessions.actAs(alias);
        api.acceptLanguage(language);
        api.get(ACTIONS_PATH);
    }

    @Given("{string} recorded {string} before the history was written in Czech as {string}")
    public void recordedBeforeTheHistoryWasWrittenInCzech(String alias, String action, String details) {
        jdbc.sql("insert into admin_action (id, admin_id, action, subject_id, details, performed_at) values (?, ?, ?, ?, ?, ?)")
                .params(UUID.randomUUID(), scenarioDonors.idOf(alias), action, null, resolveIds(details), Timestamp.from(clock.instant().minusSeconds(3600)))
                .update();
    }

    @When("{string} asks for the {int} newest admin actions")
    public void asksForTheNewestAdminActions(String alias, int limit) {
        sessions.actAs(alias);
        api.get(ACTIONS_PATH + "?limit=" + limit);
    }

    @When("{string} asks for the {int} admin actions before the oldest one listed")
    public void asksForTheAdminActionsBeforeTheOldestOneListed(String alias, int limit) {
        JsonNode items = api.lastResponseJson().get("items");
        String oldest = items.get(items.size() - 1).get("performedAt").asString();
        sessions.actAs(alias);
        api.get(ACTIONS_PATH + "?limit=" + limit + "&before=" + oldest);
    }

    @When("someone without a token asks for the admin actions")
    public void someoneWithoutATokenAsksForTheAdminActions() {
        api.forgetCredentials();
        api.get(ACTIONS_PATH);
    }

    @Then("the admin actions are:")
    public void theAdminActionsAre(DataTable table) {
        List<Map<String, String>> expected = table.asMaps().stream()
                .map(row -> row.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, cell -> resolveIds(cell.getValue()))))
                .toList();
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("items").forEach(item -> {
            Map<String, String> row = new HashMap<>();
            for (String column : expected.getFirst().keySet()) {
                row.put(column, switch (column) {
                    case "subject" -> aliasOf(item.get("subjectId"));
                    case "donor" -> aliasOf(item.get("donorId"));
                    default -> item.get(column).asString();
                });
            }
            actual.add(row);
        });
        assertThat(actual).containsExactlyElementsOf(expected);
    }

    @Then("the admin actions came through these applications:")
    public void theAdminActionsCameThroughTheseApplications(DataTable table) {
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("items").forEach(item -> {
            JsonNode client = item.get("client");
            actual.add(Map.of("action", item.get("action").asString(), "client", client == null || client.isNull() ? "" : client.asString()));
        });
        List<Map<String, String>> expected = table.asMaps().stream()
                .map(row -> Map.of("action", row.get("action"), "client", row.get("client") == null ? "" : row.get("client")))
                .toList();
        assertThat(actual).containsExactlyInAnyOrderElementsOf(expected);
    }

    @Then("the admin actions have more pages")
    public void theAdminActionsHaveMorePages() {
        assertThat(api.lastResponseJson().get("hasMore").asBoolean()).isTrue();
    }

    @Then("the admin actions have no more pages")
    public void theAdminActionsHaveNoMorePages() {
        assertThat(api.lastResponseJson().get("hasMore").asBoolean()).isFalse();
    }

    @Then("every admin action names when it was performed and what it changed")
    public void everyAdminActionNamesWhenAndWhat() {
        JsonNode items = api.lastResponseJson().get("items");
        assertThat(items).isNotEmpty();
        items.forEach(item -> {
            assertThat(item.get("id").asString()).isNotBlank();
            assertThat(item.get("performedAt").asString()).isNotBlank();
            assertThat(item.get("details").asString()).isNotBlank();
            assertThat(item.get("adminId").asString()).isEqualTo(scenarioDonors.idOf("Jana").toString());
        });
    }

    private String resolveIds(String details) {
        String resolved = details;
        for (String alias : List.of("Jana", "Petr", "Eva")) {
            String id = scenarioDonors.findIdOf(alias).map(UUID::toString).orElse(alias);
            resolved = resolved.replace("<" + alias + ">", id);
        }
        return resolved;
    }

    private String aliasOf(JsonNode subjectId) {
        if (subjectId == null || subjectId.isNull()) {
            return "";
        }
        UUID id = UUID.fromString(subjectId.asString());
        for (String alias : List.of("Jana", "Petr", "Eva")) {
            if (scenarioDonors.findIdOf(alias).filter(id::equals).isPresent()) {
                return alias;
            }
        }
        return id.toString();
    }
}
