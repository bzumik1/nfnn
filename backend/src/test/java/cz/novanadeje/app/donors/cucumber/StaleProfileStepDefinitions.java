package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ConcurrentWrites;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ProfileRowVersions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

public class StaleProfileStepDefinitions {

    private static final String PROFILE = "/api/donors/me";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final ProfileRowVersions versions;
    private final ConcurrentWrites concurrentWrites;
    private final Map<String, String> readVersions = new HashMap<>();

    public StaleProfileStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, ProfileRowVersions versions,
                                       ConcurrentWrites concurrentWrites) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.versions = versions;
        this.concurrentWrites = concurrentWrites;
    }

    @When("these profile changes of {string} start one after another from the version read before them, while the donor's row is held:")
    public void theseProfileChangesStartWhileTheDonorRowIsHeld(String alias, DataTable table) {
        UUID donor = scenarioDonors.idOf(alias);
        Supplier<String> versionNow = () -> versions.of(donor);
        List<ConcurrentWrites.Write> writes = table.asList().stream().skip(1).map(name -> {
            String read = versionNow.get();
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put(HttpHeaders.AUTHORIZATION, sessions.bearerOf(alias));
            headers.putAll(ApiClient.ifMatch(read));
            return new ConcurrentWrites.Write(new ApiClient.PreparedRequest(HttpMethod.PATCH, PROFILE, Map.of("name", name), headers), read, versionNow);
        }).toList();
        concurrentWrites.sendWhileHeld("select id from donor where id = ? for update", donor, writes);
    }

    @When("{string} opens the profile in a tab")
    public void opensTheProfileInATab(String alias) {
        sessions.actAs(alias);
        api.get(PROFILE);
        readVersions.put(alias, api.lastResponseJson().get("version").asString());
    }

    @When("{string} saves the name {string} from the version read in the tab")
    public void savesTheNameFromTheVersionReadInTheTab(String alias, String name) {
        sessions.actAs(alias);
        api.patch(PROFILE, Map.of("name", name), ApiClient.ifMatch(readVersions.get(alias)));
    }

    @When("{string} saves the name {string} in another tab")
    public void savesTheNameInAnotherTab(String alias, String name) {
        sessions.actAs(alias);
        api.patch(PROFILE, Map.of("name", name), ApiClient.ifMatch(versions.of(scenarioDonors.idOf(alias))));
    }

    @When("{string} saves the name {string} from the version in the refusal")
    public void savesTheNameFromTheVersionInTheRefusal(String alias, String name) {
        String version = api.lastResponseJson().get("version").asString();
        sessions.actAs(alias);
        api.patch(PROFILE, Map.of("name", name), ApiClient.ifMatch(version));
    }

    @When("{string} saves the name {string} naming no version")
    public void savesTheNameNamingNoVersion(String alias, String name) {
        sessions.actAs(alias);
        api.patch(PROFILE, Map.of("name", name));
    }

    @When("someone without a token saves the name {string} naming the version of {string}")
    public void someoneWithoutATokenSavesTheName(String name, String alias) {
        String version = versions.of(scenarioDonors.idOf(alias));
        api.forgetCredentials();
        api.patch(PROFILE, Map.of("name", name), ApiClient.ifMatch(version));
    }

    @Then("the refusal names the profile version of {string} now stored and the stored name {string}")
    public void theRefusalNamesTheProfileVersionNowStored(String alias, String name) {
        assertThat(api.lastResponseJson().get("version").asString()).isEqualTo(versions.of(scenarioDonors.idOf(alias)));
        assertThat(api.lastResponseJson().get("current").get("name").asString()).isEqualTo(name);
    }

    @Then("the profile answers the name {string} and the version of {string} now stored")
    public void theProfileAnswersTheNameAndTheVersionNowStored(String name, String alias) {
        assertThat(api.lastResponseJson().get("name").asString()).isEqualTo(name);
        assertThat(api.lastResponseJson().get("version").asString()).isEqualTo(versions.of(scenarioDonors.idOf(alias)));
    }

    @Then("the stored name of {string} is {string}")
    public void theStoredNameIs(String alias, String name) {
        sessions.actAs(alias);
        assertThat(api.get(PROFILE).getStatusCode().value()).isEqualTo(200);
        assertThat(api.lastResponseJson().get("name").asString()).isEqualTo(name);
    }
}
