package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.RecordingMailSender;
import cz.novanadeje.app.support.RecordingSetupCodeAnnouncer;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class ApiTranscriptHooks {

    private static final String ASYNC_EXECUTOR = "applicationTaskExecutor";
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
    private LogLineCapture logLines;

    public ApiTranscriptHooks(ApiTranscriptRecorder recorder, RecordingMailSender mailSender, RecordingSetupCodeAnnouncer setupCodes,
                              ScenarioDonors donors, JdbcClient jdbc, ApplicationContext context) {
        this.recorder = recorder;
        this.mailSender = mailSender;
        this.setupCodes = setupCodes;
        this.donors = donors;
        this.jdbc = jdbc;
        this.context = context;
    }

    @Before(order = AFTER_EVERY_OTHER_SET_UP)
    public void startCapturingLogLines() {
        if (ApiTranscripts.recording()) {
            logLines = LogLineCapture.attach();
        }
    }

    @After(order = AFTER_EVERY_OTHER_TEAR_DOWN)
    public void writeTranscript(Scenario scenario) throws InterruptedException {
        if (!ApiTranscripts.recording()) {
            return;
        }
        awaitAsyncWork();
        logLines.detach();
        ScenarioTranscript transcript = recorder.transcript();
        transcript.mails(mailSender.sent());
        transcript.logs(logLines.lines());
        ApiTranscripts.store(scenario.getUri().toString(), scenario.getName(), transcript.toJson(knownValues()));
    }

    private Map<String, String> knownValues() {
        Map<String, String> known = new HashMap<>();
        jdbc.sql("select variable_symbol from donor where variable_symbol is not null union select variable_symbol from donor_record where variable_symbol is not null")
                .query(String.class).list()
                .forEach(symbol -> known.put(symbol, NUMBERED_VARIABLE_SYMBOL));
        donors.variableSymbolsByAlias().forEach((alias, symbol) -> known.put(symbol, "<vs:" + alias + ">"));
        donors.secondFactorSecrets().forEach(secret -> known.put(secret, TranscriptNormaliser.SECRET));
        Optional.ofNullable(context.getEnvironment().getProperty(SIGNATORY_NAME_PROPERTY)).filter(name -> !name.isBlank())
                .ifPresent(name -> known.put(name, SIGNATORY_NAME));
        setupCodes.findAnnounced().ifPresent(code -> {
            known.put(code.value(), SETUP_CODE);
            known.put(code.display(), SETUP_CODE);
        });
        return known;
    }

    private void awaitAsyncWork() throws InterruptedException {
        if (!(context.getBean(ASYNC_EXECUTOR) instanceof ThreadPoolTaskExecutor executor)) {
            return;
        }
        long deadline = System.nanoTime() + ASYNC_WAIT.toNanos();
        while (executor.getActiveCount() > 0 || !executor.getThreadPoolExecutor().getQueue().isEmpty()) {
            if (System.nanoTime() > deadline) {
                throw new IllegalStateException("Asynchronous work did not finish within " + ASYNC_WAIT);
            }
            Thread.sleep(20);
        }
    }
}
