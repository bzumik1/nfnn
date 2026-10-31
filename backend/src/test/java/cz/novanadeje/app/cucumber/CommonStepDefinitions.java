package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.donors.application.CompanyLookupService;
import cz.novanadeje.app.operations.application.backup.BackupKeyWordChallenges;
import cz.novanadeje.app.operations.application.clienterrors.ClientErrorCap;
import cz.novanadeje.app.support.AsyncTaskTracker;
import cz.novanadeje.app.support.BackupKeyWordDraws;
import cz.novanadeje.app.support.ClientErrorCapWindows;
import cz.novanadeje.app.support.CompanyLookupPause;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.FakeCompanyRegistry;
import cz.novanadeje.app.support.FakeFioClient;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RateLimiterWindows;
import cz.novanadeje.app.support.RecordingMailSender;
import cz.novanadeje.app.support.ServerReceiptSigningKey;
import cz.novanadeje.app.support.SwitchablePublicBackupKeyPolicy;
import cz.novanadeje.app.support.SwitchablePublicTestKeyPolicy;
import io.cucumber.java.Before;
import io.cucumber.java.BeforeAll;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.awaitility.Awaitility;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public class CommonStepDefinitions {

    private static final Duration POLL_INTERVAL = Duration.ofMillis(10);
    private static final Duration ASYNC_WORK_WAIT = Duration.ofSeconds(10);

    private final ApiClient api;
    private final RecordingMailSender mailSender;
    private final MutableClock clock;
    private final DatabaseCleaner database;
    private final FakeFioClient fioClient;
    private final FakeCompanyRegistry companyRegistry;
    private final ConfigurableApplicationContext context;
    private final AsyncTaskTracker asyncTasks;

    public CommonStepDefinitions(ApiClient api, RecordingMailSender mailSender, MutableClock clock, DatabaseCleaner database,
                                 FakeFioClient fioClient, FakeCompanyRegistry companyRegistry, ConfigurableApplicationContext context,
                                 AsyncTaskTracker asyncTasks) {
        this.api = api;
        this.mailSender = mailSender;
        this.clock = clock;
        this.database = database;
        this.fioClient = fioClient;
        this.companyRegistry = companyRegistry;
        this.context = context;
        this.asyncTasks = asyncTasks;
    }

    @BeforeAll
    public static void pollWithoutDelay() {
        Awaitility.setDefaultPollDelay(Duration.ZERO);
        Awaitility.setDefaultPollInterval(POLL_INTERVAL);
    }

    @Before
    public void isolateScenario() {
        asyncTasks.awaitIdleAfter("the previous scenario", ASYNC_WORK_WAIT);
        database.emptyAllTables();
        mailSender.clear();
        mailSender.startScenario();
        fioClient.reset();
        companyRegistry.reset();
        clock.set(ApiTranscripts.RECORDING_CLOCK);
        ServerReceiptSigningKey.storeAfterEmptyTables(context);
        RateLimiterWindows.reset(context);
        CompanyLookupPause.reset(context.getBean(CompanyLookupService.class));
        ClientErrorCapWindows.reset(context.getBean(ClientErrorCap.class));
        BackupKeyWordDraws.reseed(context.getBean(BackupKeyWordChallenges.class));
        context.getBean(SwitchablePublicBackupKeyPolicy.class).reset();
        context.getBean(SwitchablePublicTestKeyPolicy.class).reset();
    }

    @When("{int} seconds pass")
    public void secondsPass(int seconds) {
        clock.advance(Duration.ofSeconds(seconds));
    }

    @When("{int} minutes pass")
    public void minutesPass(int minutes) {
        clock.advance(Duration.ofMinutes(minutes));
    }

    @When("the following requests come from another client address")
    public void theFollowingRequestsComeFromAnotherClientAddress() {
        api.comeFromAnotherAddress();
    }

    @When("the following requests come from the client address {string}")
    public void theFollowingRequestsComeFromTheClientAddress(String clientAddress) {
        api.comeFrom(clientAddress);
    }

    @Then("the response status is {int}")
    public void theResponseStatusIs(int status) {
        assertThat(api.lastResponse().getStatusCode().value())
                .withFailMessage("Expected status %d but got %d with body %s", status, api.lastResponse().getStatusCode().value(), api.lastResponse().getBody())
                .isEqualTo(status);
    }

    @Then("the problem type ends with {string}")
    public void theProblemTypeEndsWith(String suffix) {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        assertThat(api.lastResponseJson().get("type").asString()).endsWith(suffix);
    }

    @Then("the problem lists errors for fields {string} and {string}")
    public void theProblemListsErrorsForFields(String first, String second) {
        assertThat(errorFields()).contains(first, second);
    }

    @Then("the problem lists an error for field {string}")
    public void theProblemListsAnErrorForField(String field) {
        assertThat(errorFields()).contains(field);
    }

    @Then("the problem's error for field {string} says {string}")
    public void theProblemsErrorForFieldSays(String field, String message) {
        assertThat(errorFields()).contains(field);
        assertThat(api.lastResponseJson().get("errors").valueStream()
                .filter(error -> error.get("field").asString().equals(field))
                .map(error -> error.get("message").asString()))
                .contains(message);
    }

    @Then("the problem's detail starts with {string}")
    public void theProblemsDetailStartsWith(String start) {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        assertThat(api.lastResponseJson().get("detail").asString()).startsWith(start);
    }

    @Then("the problem's only error for field {string} says {string}")
    public void theProblemsOnlyErrorForFieldSays(String field, String message) {
        assertThat(errorFields()).contains(field);
        assertThat(api.lastResponseJson().get("errors").valueStream()
                .filter(error -> error.get("field").asString().equals(field))
                .map(error -> error.get("message").asString()))
                .containsExactly(message);
    }

    private List<String> errorFields() {
        assertThat(api.lastResponse().getHeaders().getContentType().toString()).startsWith("application/problem+json");
        JsonNode errors = api.lastResponseJson().get("errors");
        assertThat(errors).withFailMessage("No errors in %s", api.lastResponse().getBody()).isNotNull();
        return errors.valueStream().map(error -> error.get("field").asString()).toList();
    }
}
