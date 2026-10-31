package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.AsyncTaskTracker;
import cz.novanadeje.app.support.RecordingMailSender;
import cz.novanadeje.app.support.RecordingSetupCodeAnnouncer;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.BeforeAll;
import io.cucumber.java.Scenario;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class ApiTranscriptHooks {

    private static final Duration ASYNC_WAIT = Duration.ofSeconds(15);
    private static final String NUMBERED_VARIABLE_SYMBOL = "<vs:#>";
    private static final String SETUP_CODE = "<setup-code>";
    private static final String SIGNATORY_NAME = "<signatory-name>";
    private static final String SIGNATORY_NAME_PROPERTY = "app.donations.receipt.signatory-name";
    private static final int AFTER_EVERY_OTHER_SET_UP = 100_000;
    private static final int AFTER_EVERY_OTHER_TEAR_DOWN = 0;

    private final ApiTranscriptRecorder recorder;
    private final RecordingMailSender mailSender;
    private final RecordingSetupCodeAnnouncer setupCodes;
    private final ScenarioDonors donors;
    private final JdbcClient jdbc;
    private final ApplicationContext context;
    private final AsyncTaskTracker asyncTasks;
    private LogLineCapture logLines;

    public ApiTranscriptHooks(ApiTranscriptRecorder recorder, RecordingMailSender mailSender, RecordingSetupCodeAnnouncer setupCodes,
                              ScenarioDonors donors, JdbcClient jdbc, ApplicationContext context,
                              AsyncTaskTracker asyncTasks) {
        this.recorder = recorder;
        this.mailSender = mailSender;
        this.setupCodes = setupCodes;
        this.donors = donors;
        this.jdbc = jdbc;
        this.context = context;
        this.asyncTasks = asyncTasks;
    }

    @BeforeAll
    public static void startRecordingRun() {
        if (ApiTranscripts.recording()) {
            ApiTranscripts.startRun();
        }
    }

    @Before(order = AFTER_EVERY_OTHER_SET_UP)
    public void startCapturingLogLines() {
        if (ApiTranscripts.recording()) {
            ApiTranscripts.refuseRealSecrets(System.getenv());
            logLines = LogLineCapture.attach();
        }
    }

    @After(order = AFTER_EVERY_OTHER_TEAR_DOWN)
    public void writeTranscript(Scenario scenario) {
        if (!ApiTranscripts.recording()) {
            return;
        }
        awaitAsynchronousWork(asyncTasks);
        logLines.detach();
        ScenarioTranscript transcript = recorder.transcript();
        transcript.mails(mailSender.sentInScenario());
        transcript.logs(logLines.lines());
        String key = ApiTranscripts.scenarioKey(ApiTranscripts.featureText(scenario.getUri()), scenario.getName(), scenario.getLine());
        ApiTranscripts.store(scenario.getUri().toString(), key, transcript.toJson(knownValues()));
    }

    private Map<String, String> knownValues() {
        Map<String, String> known = new HashMap<>();
        jdbc.sql("select variable_symbol from donor where variable_symbol is not null union select variable_symbol from donor_record where variable_symbol is not null")
                .query(String.class).list()
                .forEach(symbol -> known.put(symbol, NUMBERED_VARIABLE_SYMBOL));
        donors.variableSymbolsByAlias().forEach((alias, symbol) -> known.put(symbol, "<vs:" + alias + ">"));
        donors.everySecondFactorSecret().forEach(secret -> known.put(secret, TranscriptNormaliser.SECRET));
        Optional.ofNullable(context.getEnvironment().getProperty(SIGNATORY_NAME_PROPERTY)).filter(name -> !name.isBlank())
                .ifPresent(name -> known.put(name, SIGNATORY_NAME));
        setupCodes.findAnnounced().ifPresent(code -> {
            known.put(code.value(), SETUP_CODE);
            known.put(code.display(), SETUP_CODE);
        });
        return known;
    }

    static void awaitAsynchronousWork(AsyncTaskTracker asyncTasks) {
        asyncTasks.awaitIdleAfter("the scenario", ASYNC_WAIT);
    }
}
