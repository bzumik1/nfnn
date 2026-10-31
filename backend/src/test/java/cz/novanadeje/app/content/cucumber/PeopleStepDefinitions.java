package cz.novanadeje.app.content.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class PeopleStepDefinitions {

    private static final String PEOPLE = "/api/admin/content/people";
    private static final String ACCESS_TOKEN = "access_token";
    private static final List<String> PEOPLE_ACTIONS = List.of("ADD_PERSON", "UPDATE_PERSON", "REMOVE_PERSON", "ORDER_PEOPLE",
            "CHANGE_FOUNDERS_NOTE", "CHANGE_PEOPLE_FOOTNOTE", "CHANGE_WEB_SIGNATURE", "REMOVE_WEB_SIGNATURE");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final UploadedImages images;
    private final Map<String, String> idsByName = new HashMap<>();
    private String exchangedApiToken;

    public PeopleStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, UploadedImages images) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.images = images;
    }

    @When("{string} asks for the people of the foundation")
    public void asksForThePeopleOfTheFoundation(String alias) {
        sessions.actAs(alias);
        api.get(PEOPLE);
    }

    @When("the exchanged API token asks for the people of the foundation")
    public void theExchangedApiTokenAsksForThePeopleOfTheFoundation() {
        actAsExchangedApiToken();
        api.get(PEOPLE);
    }

    @When("someone without a token asks for the people of the foundation")
    public void someoneWithoutATokenAsksForThePeopleOfTheFoundation() {
        api.forgetCredentials();
        api.get(PEOPLE);
    }

    @Given("{string} adds a person:")
    public void addsAPerson(String alias, Map<String, String> fields) {
        sessions.actAs(alias);
        add(fields);
    }

    @When("{string} adds a person whose {word} has a line break")
    public void addsAPersonWhoseTextHasALineBreak(String alias, String field) {
        sessions.actAs(alias);
        Map<String, String> fields = new HashMap<>(Map.of("name", "Eva Vzorová", "onBoard", "true"));
        fields.put(field, "Eva\nVzorová");
        add(fields);
    }

    @When("the exchanged API token adds a person:")
    public void theExchangedApiTokenAddsAPerson(Map<String, String> fields) {
        actAsExchangedApiToken();
        add(fields);
    }

    @Given("{string} adds {int} people")
    public void addsPeople(String alias, int count) {
        sessions.actAs(alias);
        for (int index = 1; index <= count; index++) {
            add(Map.of("name", "Osoba " + index));
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(201);
        }
    }

    @When("{string} updates the person {string}:")
    public void updatesThePerson(String alias, String name, Map<String, String> fields) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/" + idOf(name), personBody(fields));
    }

    @When("the exchanged API token updates the person {string}:")
    public void theExchangedApiTokenUpdatesThePerson(String name, Map<String, String> fields) {
        actAsExchangedApiToken();
        api.put(PEOPLE + "/" + idOf(name), personBody(fields));
    }

    @When("{string} updates a person who does not exist")
    public void updatesAPersonWhoDoesNotExist(String alias) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/0199f3e0-0000-7000-8000-000000000000", personBody(Map.of("name", "Nikdo")));
    }

    @When("{string} removes the person {string}")
    public void removesThePerson(String alias, String name) {
        sessions.actAs(alias);
        api.delete(PEOPLE + "/" + idOf(name));
    }

    @When("the exchanged API token removes the person {string}")
    public void theExchangedApiTokenRemovesThePerson(String name) {
        actAsExchangedApiToken();
        api.delete(PEOPLE + "/" + idOf(name));
    }

    @When("someone without a token removes the person {string}")
    public void someoneWithoutATokenRemovesThePerson(String name) {
        api.forgetCredentials();
        api.delete(PEOPLE + "/" + idOf(name));
    }

    @When("{string} orders the people:")
    public void ordersThePeople(String alias, List<String> names) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/order", Map.of("memberIds", names.stream().map(this::idOf).toList()));
    }

    @When("the exchanged API token orders the people:")
    public void theExchangedApiTokenOrdersThePeople(List<String> names) {
        actAsExchangedApiToken();
        api.put(PEOPLE + "/order", Map.of("memberIds", names.stream().map(this::idOf).toList()));
    }

    @Given("{string} writes the founders note:")
    public void writesTheFoundersNote(String alias, String text) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/note", note(text));
    }

    @When("{string} writes a founders note of {int} characters")
    public void writesAFoundersNoteOfCharacters(String alias, int length) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/note", note("x".repeat(length)));
    }

    @When("{string} empties the founders note")
    public void emptiesTheFoundersNote(String alias) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/note", note(null));
    }

    @When("the exchanged API token writes the founders note:")
    public void theExchangedApiTokenWritesTheFoundersNote(String text) {
        actAsExchangedApiToken();
        api.put(PEOPLE + "/note", note(text));
    }

    @When("{string} writes the line under the board:")
    public void writesTheLineUnderTheBoard(String alias, String text) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/footnote", note(text));
    }

    @When("{string} writes a line under the board of {int} characters")
    public void writesALineUnderTheBoardOfCharacters(String alias, int length) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/footnote", note("x".repeat(length)));
    }

    @When("{string} empties the line under the board")
    public void emptiesTheLineUnderTheBoard(String alias) {
        sessions.actAs(alias);
        api.put(PEOPLE + "/footnote", note(null));
    }

    @When("the exchanged API token writes the line under the board:")
    public void theExchangedApiTokenWritesTheLineUnderTheBoard(String text) {
        actAsExchangedApiToken();
        api.put(PEOPLE + "/footnote", note(text));
    }

    @Given("{string} sets the web signature of {string} to the image uploaded as {string}")
    public void setsTheWebSignature(String alias, String name, String fileName) {
        sessions.actAs(alias);
        api.post(PEOPLE + "/" + idOf(name) + "/web-signature", Map.of("imageId", images.idOf(fileName)));
    }

    @When("{string} sets the web signature of {string} to an image that was never uploaded")
    public void setsTheWebSignatureToAnUnknownImage(String alias, String name) {
        sessions.actAs(alias);
        api.post(PEOPLE + "/" + idOf(name) + "/web-signature", Map.of("imageId", "0199f3e0-0000-7000-8000-000000000000"));
    }

    @When("{string} removes the web signature of {string}")
    public void removesTheWebSignature(String alias, String name) {
        sessions.actAs(alias);
        api.delete(PEOPLE + "/" + idOf(name) + "/web-signature");
    }

    @When("the exchanged API token sets the web signature of {string} to the image uploaded as {string}")
    public void theExchangedApiTokenSetsTheWebSignature(String name, String fileName) {
        actAsExchangedApiToken();
        api.post(PEOPLE + "/" + idOf(name) + "/web-signature", Map.of("imageId", images.idOf(fileName)));
    }

    @When("the exchanged API token removes the web signature of {string}")
    public void theExchangedApiTokenRemovesTheWebSignature(String name) {
        actAsExchangedApiToken();
        api.delete(PEOPLE + "/" + idOf(name) + "/web-signature");
    }

    @Then("the person says:")
    public void thePersonSays(Map<String, String> expected) {
        assertPerson(api.lastResponseJson(), expected);
    }

    @Then("the people of the foundation are:")
    public void thePeopleOfTheFoundationAre(DataTable table) {
        List<Map<String, String>> expected = table.asMaps();
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("members").forEach(member -> actual.add(row(member, expected.getFirst().keySet())));
        assertThat(actual).containsExactlyElementsOf(expected.stream().map(this::resolved).toList());
    }

    @When("{string} asks for her own person of the foundation")
    public void asksForHerOwnPerson(String alias) {
        sessions.actAs(alias);
        api.get(PEOPLE + "/me");
    }

    @Then("her own person of the foundation is {string}")
    public void herOwnPersonIs(String name) {
        assertThat(api.lastResponseJson().get("member").get("name").asString()).isEqualTo(name);
        assertThat(api.lastResponseJson().get("member").get("linkedToAccount").asBoolean()).isTrue();
    }

    @Then("she has no own person of the foundation")
    public void sheHasNoOwnPerson() {
        assertThat(api.lastResponseJson().get("member").isNull()).isTrue();
    }

    @Then("there are no people of the foundation and no founders note")
    public void thereAreNoPeopleAndNoNote() {
        assertThat(api.lastResponseJson().get("members")).isEmpty();
        assertThat(api.lastResponseJson().get("note").isNull()).isTrue();
    }

    @Then("the founders note is:")
    public void theFoundersNoteIs(String text) {
        assertThat(noteText(api.lastResponseJson())).isEqualTo(text);
    }

    @Then("the founders note is empty")
    public void theFoundersNoteIsEmpty() {
        assertThat(api.lastResponseJson().get(api.lastResponseJson().has("members") ? "note" : "text").isNull()).isTrue();
    }

    @Then("the line under the board is {string}")
    public void theLineUnderTheBoardIs(String text) {
        assertThat(footnote(api.lastResponseJson()).asString()).isEqualTo(text);
    }

    @Then("the line under the board is empty")
    public void theLineUnderTheBoardIsEmpty() {
        assertThat(footnote(api.lastResponseJson()).isNull()).isTrue();
    }

    @Then("the home line under the board is {string}")
    public void theHomeLineUnderTheBoardIs(String text) {
        assertThat(api.lastResponseJson().get("people").get("footnote").asString()).isEqualTo(text);
    }

    @Then("the home content has no line under the board")
    public void theHomeContentHasNoLineUnderTheBoard() {
        assertThat(api.lastResponseJson().get("people").get("footnote").isNull()).isTrue();
    }

    @Then("the home content has no people of the foundation")
    public void theHomeContentHasNoPeople() {
        assertThat(api.lastResponseJson().get("people").isNull()).isTrue();
    }

    @Then("the home cards of the people are:")
    public void theHomeCardsOfThePeopleAre(DataTable table) {
        List<Map<String, String>> expected = table.asMaps();
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("people").get("featured").forEach(card -> actual.add(row(card, expected.getFirst().keySet())));
        assertThat(actual).containsExactlyElementsOf(expected.stream().map(this::resolved).toList());
    }

    @Then("the home board line is:")
    public void theHomeBoardLineIs(DataTable table) {
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("people").get("board").forEach(member -> actual.add(row(member, List.of("name", "note"))));
        assertThat(actual).containsExactlyElementsOf(table.asMaps().stream().map(this::resolved).toList());
    }

    @Then("the home founders note is:")
    public void theHomeFoundersNoteIs(String text) {
        assertThat(api.lastResponseJson().get("people").get("note").get("text").asString()).isEqualTo(text);
    }

    @Then("the home founders note is signed by:")
    public void theHomeFoundersNoteIsSignedBy(DataTable table) {
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("people").get("note").get("signatures").forEach(signature -> actual.add(row(signature, List.of("name", "url", "width", "height"))));
        assertThat(actual).containsExactlyElementsOf(table.asMaps().stream().map(this::resolved).toList());
    }

    @Then("the people on the home page carry no e-mail address")
    public void thePeopleOnTheHomePageCarryNoEmailAddress() {
        String people = api.lastResponseJson().get("people").toString();
        assertThat(people).isNotEqualTo("null").doesNotContain("@").doesNotContainIgnoringCase("mail");
    }

    @Then("the home content has no founders note")
    public void theHomeContentHasNoFoundersNote() {
        assertThat(api.lastResponseJson().get("people").get("note").isNull()).isTrue();
    }

    @Then("the admin action {string} by {string} on the person {string} is recorded with details containing {string}")
    public void theAdminActionOnThePersonIsRecorded(String action, String alias, String name, String details) {
        List<String> recorded = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id is null")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .query(String.class)
                .list();
        String person = idOf(name);
        String expected = resolve(details);
        assertThat(recorded).filteredOn(recordedDetails -> recordedDetails.contains(person) && recordedDetails.contains(expected)).hasSize(1);
    }

    @Then("these admin actions were recorded:")
    public void theseAdminActionsWereRecorded(DataTable table) {
        List<Map<String, String>> recorded = jdbc.sql("select action, coalesce(client, '') as client from admin_action where action in (:actions)")
                .param("actions", PEOPLE_ACTIONS)
                .query((rows, number) -> Map.of("action", rows.getString("action"), "client", rows.getString("client")))
                .list();
        List<Map<String, String>> expected = table.asMaps().stream()
                .map(row -> Map.of("action", row.get("action"), "client", row.get("client") == null ? "" : row.get("client")))
                .toList();
        assertThat(recorded).containsExactlyInAnyOrderElementsOf(expected);
    }

    private void add(Map<String, String> fields) {
        api.post(PEOPLE, personBody(fields));
        JsonNode created = api.lastResponseJson();
        if (api.lastResponse().getStatusCode().value() == 201) {
            idsByName.put(created.get("name").asString(), created.get("id").asString());
        }
    }

    private String idOf(String name) {
        String id = idsByName.get(name);
        if (id == null) {
            throw new IllegalArgumentException("No person \"" + name + "\" was added in this scenario; known: " + idsByName.keySet());
        }
        return id;
    }

    private Map<String, Object> personBody(Map<String, String> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", fields.get("name"));
        body.put("role", fields.get("role"));
        body.put("onBoard", Boolean.parseBoolean(fields.getOrDefault("onBoard", "false")));
        body.put("boardNote", fields.get("boardNote"));
        body.put("featured", Boolean.parseBoolean(fields.getOrDefault("featured", "false")));
        body.put("portraitId", fields.get("portrait") == null ? null : imageId(fields.get("portrait")));
        body.put("personalEmail", fields.get("personalEmail"));
        body.put("fundEmail", fields.get("fundEmail"));
        return body;
    }

    private String imageId(String reference) {
        return reference.startsWith("0") ? reference : images.idOf(reference);
    }

    private static Map<String, Object> note(String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", text);
        return body;
    }

    private static JsonNode footnote(JsonNode response) {
        return response.has("members") ? response.get("footnote") : response.get("text");
    }

    private static String noteText(JsonNode response) {
        JsonNode note = response.has("members") ? response.get("note") : response.get("text");
        return note.asString();
    }

    private void assertPerson(JsonNode person, Map<String, String> expected) {
        assertThat(row(person, expected.keySet())).isEqualTo(resolved(expected));
    }

    private Map<String, String> row(JsonNode node, Iterable<String> columns) {
        Map<String, String> row = new LinkedHashMap<>();
        for (String column : columns) {
            JsonNode value = at(node, column);
            row.put(column, value == null || value.isNull() ? "" : value.asString());
        }
        return row;
    }

    private Map<String, String> resolved(Map<String, String> expected) {
        Map<String, String> row = new LinkedHashMap<>();
        expected.forEach((column, value) -> row.put(column, resolve(value == null ? "" : value)));
        return row;
    }

    private String resolve(String value) {
        String resolved = value;
        if (resolved.contains("{image:")) {
            int start = resolved.indexOf("{image:");
            int end = resolved.indexOf('}', start);
            String fileName = resolved.substring(start + "{image:".length(), end);
            resolved = resolved.substring(0, start) + images.idOf(fileName) + resolved.substring(end + 1);
            return resolve(resolved);
        }
        return resolved;
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

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }
}
