package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminDonorsStepDefinitions {

    private static final String DONORS_PATH = "/api/admin/donors";
    private static final UUID UNKNOWN_DONOR = UUID.fromString("019a1c00-0000-7000-8000-00000000dead");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;

    public AdminDonorsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
    }

    @When("{string} searches the donors for {string}")
    public void searchesTheDonorsFor(String alias, String query) {
        sessions.actAs(alias);
        api.get(DONORS_PATH + "?query=" + scenarioDonors.resolve(query));
    }

    @When("someone without a token searches the donors")
    public void someoneWithoutATokenSearchesTheDonors() {
        api.forgetCredentials();
        api.get(DONORS_PATH + "?query=jana");
    }

    @When("{string} opens the donor {string}")
    public void opensTheDonor(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.get(DONORS_PATH + "/" + scenarioDonors.idOf(donorAlias));
    }

    @When("{string} opens an unknown donor")
    public void opensAnUnknownDonor(String alias) {
        sessions.actAs(alias);
        api.get(DONORS_PATH + "/" + UNKNOWN_DONOR);
    }

    @When("someone without a token opens a donor")
    public void someoneWithoutATokenOpensADonor() {
        api.forgetCredentials();
        api.get(DONORS_PATH + "/" + UNKNOWN_DONOR);
    }

    @Then("the found donor accounts are none")
    public void theFoundDonorAccountsAreNone() {
        assertThat(items()).isEmpty();
    }

    @Then("^the found donor accounts are (\".+)$")
    public void theFoundDonorAccountsAre(String aliases) {
        List<UUID> expected = Arrays.stream(aliases.replace(" and ", ",").split(","))
                .map(String::trim)
                .map(alias -> alias.replace("\"", ""))
                .map(scenarioDonors::idOf)
                .toList();
        assertThat(items()).extracting(item -> UUID.fromString(item.get("donorId").asString())).containsExactlyInAnyOrderElementsOf(expected);
    }

    @Then("^the found donor \"([^\"]+)\" is a (PERSON|COMPANY), (an administrator|not an administrator), "
            + "with two-factor authentication (on|off) and a verified e-mail$")
    public void theFoundDonorIs(String alias, String type, String administrator, String secondFactor) {
        JsonNode item = items().stream()
                .filter(found -> found.get("donorId").asString().equals(scenarioDonors.idOf(alias).toString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No donor " + alias + " in " + api.lastResponse().getBody()));
        assertThat(item.get("name").asString()).isNotBlank();
        assertThat(item.get("email").asString()).isEqualTo(scenarioDonors.credentialsOf(alias).email());
        assertThat(item.get("variableSymbol").asString()).isEqualTo(scenarioDonors.variableSymbolOf(alias).value());
        assertThat(item.get("type").asString()).isEqualTo(type);
        assertThat(item.get("administrator").asBoolean()).isEqualTo(administrator.equals("an administrator"));
        assertThat(item.get("secondFactorEnabled").asBoolean()).isEqualTo(secondFactor.equals("on"));
        assertThat(item.get("emailVerified").asBoolean()).isTrue();
        assertThat(item.get("registeredAt").asString()).isNotBlank();
    }

    @Then("the donor card says:")
    public void theDonorCardSays(DataTable table) {
        JsonNode card = api.lastResponseJson();
        table.asMap().forEach((field, expected) -> {
            JsonNode value = field.equals("street") || field.equals("city") || field.equals("postalCode") ? card.get("address").get(field) : card.get(field);
            assertThat(value).withFailMessage("No field %s in %s", field, card).isNotNull();
            assertThat(value.isNull() ? "" : value.asString()).as(field).isEqualTo(scenarioDonors.resolve(expected == null ? "" : expected));
        });
    }

    @Then("the donor card says the donor registered on {date}")
    public void theDonorCardSaysTheDonorRegisteredOn(LocalDate day) {
        assertThat(api.lastResponseJson().get("registeredAt").asString()).startsWith(day.toString());
    }

    private List<JsonNode> items() {
        JsonNode json = api.lastResponseJson();
        JsonNode array = json.get("items");
        assertThat(array).withFailMessage("No items in %s", json).isNotNull();
        return array.valueStream().toList();
    }
}
