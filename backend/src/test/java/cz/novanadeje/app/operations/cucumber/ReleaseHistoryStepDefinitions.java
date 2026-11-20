package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.Revision;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

public class ReleaseHistoryStepDefinitions {

    private static final String HISTORY = "/api/admin/operations/release/history";
    private static final List<String> FIELDS = List.of("release", "revision", "startedAt", "lastStartedAt", "endedAt");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ReleaseHistoryService history;
    private final MutableClock clock;

    public ReleaseHistoryStepDefinitions(ApiClient api, DonorSessions sessions, ReleaseHistoryService history, MutableClock clock) {
        this.api = api;
        this.sessions = sessions;
        this.history = history;
        this.clock = clock;
    }

    @Given("the backend starts as revision {string} of release {string} at {string}")
    public void theBackendStartsAsRevisionOfReleaseAt(String revision, String release, String at) {
        startAt(new RunningBuild(Revision.parse(revision).orElseThrow(), Optional.of(Release.parse(release).orElseThrow())), at);
    }

    @Given("the backend starts as revision {string} without a release at {string}")
    public void theBackendStartsAsRevisionWithoutAReleaseAt(String revision, String at) {
        startAt(new RunningBuild(Revision.parse(revision).orElseThrow(), Optional.empty()), at);
    }

    @When("the release history clean-up runs at {string}")
    public void theReleaseHistoryCleanUpRunsAt(String at) {
        atInstant(at, history::deleteEndedRuns);
    }

    @When("{string} asks for the release history")
    public void asksForTheReleaseHistory(String alias) {
        sessions.actAs(alias);
        api.get(HISTORY);
    }

    @When("someone without a token asks for the release history")
    public void someoneWithoutATokenAsksForTheReleaseHistory() {
        api.forgetCredentials();
        api.get(HISTORY);
    }

    @Then("the release history is:")
    public void theReleaseHistoryIs(List<Map<String, String>> expected) {
        List<Map<String, String>> entries = new ArrayList<>();
        for (JsonNode entry : api.lastResponseJson().path("entries")) {
            Map<String, String> fields = new LinkedHashMap<>();
            FIELDS.forEach(field -> fields.put(field, entry.path(field).isNull() ? null : entry.path(field).asString()));
            entries.add(fields);
        }
        assertThat(entries).isEqualTo(expected);
    }

    private void startAt(RunningBuild build, String at) {
        atInstant(at, () -> history.recordStart(build));
    }

    private void atInstant(String at, Runnable work) {
        Instant before = clock.instant();
        clock.set(Instant.parse(at));
        try {
            work.run();
        } finally {
            clock.set(before);
        }
    }
}
