package cz.novanadeje.app.operations.cucumber;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.support.RaisedLogLevels;
import io.cucumber.java.After;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.LoggingSystem;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class UnreadableRequestTargetStepDefinitions {

    private static final String RAW_HOST = "localhost";

    private final ApiClient api;
    private final LoggingSystem loggingSystem;
    private final Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
    private final ListAppender<ILoggingEvent> everyLine = new ListAppender<>();

    public UnreadableRequestTargetStepDefinitions(ApiClient api, LoggingSystem loggingSystem) {
        this.api = api;
        this.loggingSystem = loggingSystem;
    }

    @After
    public void releaseEveryLine() {
        rootLogger.detachAppender(everyLine);
        everyLine.stop();
    }

    @When("a client sends this request target straight to the backend")
    public void aClientSendsThisRequestTargetStraightToTheBackend(String target) {
        captureEveryLine();
        api.forgetCredentials();
        api.getRaw(target, Map.of("Host", RAW_HOST));
    }

    @When("a client sends this request target straight to the backend while every logger an administrator can raise is at its loudest")
    public void aClientSendsThisRequestTargetWhileEveryLoggerIsAtItsLoudest(String target) {
        try (RaisedLogLevels raised = RaisedLogLevels.raise(loggingSystem, RaisedLogLevels.EVERY_LEVEL_AN_ADMINISTRATOR_CAN_SET)) {
            aClientSendsThisRequestTargetStraightToTheBackend(target);
        }
    }

    @Then("the backend logged no line holding {string}")
    public void theBackendLoggedNoLineHolding(String text) {
        assertThat(everyLoggedText()).noneMatch(line -> line.contains(text));
    }

    private void captureEveryLine() {
        if (!rootLogger.isAttached(everyLine)) {
            everyLine.start();
            rootLogger.addAppender(everyLine);
        }
    }

    private List<String> everyLoggedText() {
        List<ILoggingEvent> events;
        synchronized (everyLine) {
            events = List.copyOf(everyLine.list);
        }
        return events.stream().map(event -> event.getFormattedMessage()
                + (event.getThrowableProxy() == null ? "" : System.lineSeparator() + ThrowableProxyUtil.asString(event.getThrowableProxy()))).toList();
    }
}
