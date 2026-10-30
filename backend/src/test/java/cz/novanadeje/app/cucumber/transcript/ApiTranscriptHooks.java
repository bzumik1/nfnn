package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.RecordingMailSender;
import cz.novanadeje.app.support.RecordingSetupCodeAnnouncer;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.BeforeAll;
import io.cucumber.java.Scenario;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class ApiTranscriptHooks {

    private static final String ASYNC_EXECUTOR = "applicationTaskExecutor";
    private static final Duration ASYNC_WAIT = Duration.ofSeconds(15);
    private static final String NUMBERED_VARIABLE_SYMBOL = "<vs:#>";
    private static final String SETUP_CODE = "<setup-code>";
    private static final String SIGNATORY_NAME = "<signatory-name>";
    private static final String SIGNATORY_NAME_PROPERTY = "app.donations.receipt.signatory-name";
    private static final String SIGNING_KEY_PROPERTY = "app.donations.receipt.signing.key";
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
    public void writeTranscript(Scenario scenario) throws InterruptedException {
        if (!ApiTranscripts.recording()) {
            return;
        }
        awaitIdle(context.getBean(ASYNC_EXECUTOR), ASYNC_WAIT);
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
        Optional.ofNullable(context.getEnvironment().getProperty(SIGNING_KEY_PROPERTY)).filter(key -> !key.isBlank())
                .ifPresent(key -> signingSeedSpellings(key).forEach(spelling -> known.put(spelling, TranscriptNormaliser.SECRET)));
        setupCodes.findAnnounced().ifPresent(code -> {
            known.put(code.value(), SETUP_CODE);
            known.put(code.display(), SETUP_CODE);
        });
        return known;
    }

    static Set<String> signingSeedSpellings(String configuredKey) {
        byte[] seed = Base64.getDecoder().decode(configuredKey.strip());
        return Stream.of(configuredKey.strip(), Base64.getEncoder().withoutPadding().encodeToString(seed),
                Base64.getUrlEncoder().withoutPadding().encodeToString(seed), HexFormat.of().formatHex(seed)).collect(Collectors.toUnmodifiableSet());
    }

    static void awaitIdle(Object executor, Duration timeout) throws InterruptedException {
        if (!(executor instanceof ThreadPoolTaskExecutor pool)) {
            throw new IllegalStateException("The application task executor is a " + executor.getClass().getName()
                    + ", which cannot report its running work, so the recorder cannot wait for asynchronous mails and log lines");
        }
        long deadline = System.nanoTime() + timeout.toNanos();
        while (pool.getActiveCount() > 0 || !pool.getThreadPoolExecutor().getQueue().isEmpty()) {
            if (System.nanoTime() > deadline) {
                throw new IllegalStateException("Asynchronous work did not finish within " + timeout);
            }
            Thread.sleep(20);
        }
    }
}
