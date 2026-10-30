package cz.novanadeje.app.operations.cucumber;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.RaisedLogLevels;
import io.cucumber.java.After;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.http.HttpHeaders;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class RequestTextLoggingStepDefinitions {

    private static final String RAW_HOST = "localhost";
    private static final String FORM = "application/x-www-form-urlencoded";
    private static final String TOMCAT_USER_DATA_LOGGING = "org.apache.juli.logging.UserDataHelper.CONFIG";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final LoggingSystem loggingSystem;
    private final Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
    private final ListAppender<ILoggingEvent> everyLine = new ListAppender<>();

    public RequestTextLoggingStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, LoggingSystem loggingSystem) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
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
        api.sendRaw("GET", target, Map.of(HttpHeaders.HOST, RAW_HOST), "");
    }

    @When("a client sends this request target straight to the backend while every logger an administrator can raise is at its loudest")
    public void aClientSendsThisRequestTargetWhileEveryLoggerIsAtItsLoudest(String target) {
        try (RaisedLogLevels raised = loudest()) {
            aClientSendsThisRequestTargetStraightToTheBackend(target);
        }
    }

    @When("a client sends this request straight to the backend")
    public void aClientSendsThisRequestStraightToTheBackend(String request) {
        api.forgetCredentials();
        sendRawRequest(request, Map.of());
    }

    @When("{string} sends this request straight to the backend")
    public void sendsThisRequestStraightToTheBackend(String alias, String request) {
        sessions.actAs(alias);
        sendRawRequest(request, Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + donors.accessTokenOf(alias)));
    }

    @When("{string} sends this request straight to the backend while every logger an administrator can raise is at its loudest")
    public void sendsThisRequestWhileEveryLoggerIsAtItsLoudest(String alias, String request) {
        sessions.actAs(alias);
        try (RaisedLogLevels raised = loudest()) {
            sendRawRequest(request, Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + donors.accessTokenOf(alias)));
        }
    }

    @When("a client sends this request straight to the backend while every logger an administrator can raise is at its loudest")
    public void aClientSendsThisRequestWhileEveryLoggerIsAtItsLoudest(String request) {
        try (RaisedLogLevels raised = loudest()) {
            aClientSendsThisRequestStraightToTheBackend(request);
        }
    }

    @When("a client posts this form straight to {string}")
    public void aClientPostsThisFormStraightTo(String path, String form) {
        captureEveryLine();
        api.forgetCredentials();
        api.sendRaw("POST", path, Map.of(HttpHeaders.HOST, RAW_HOST, HttpHeaders.CONTENT_TYPE, FORM), form);
    }

    @When("a client posts this form straight to {string} while every logger an administrator can raise is at its loudest")
    public void aClientPostsThisFormWhileEveryLoggerIsAtItsLoudest(String path, String form) {
        try (RaisedLogLevels raised = loudest()) {
            aClientPostsThisFormStraightTo(path, form);
        }
    }

    @When("an anonymous client asks for {string} while every logger an administrator can raise is at its loudest")
    public void anAnonymousClientAsksForWhileEveryLoggerIsAtItsLoudest(String path) {
        api.forgetCredentials();
        askWhileEveryLoggerIsAtItsLoudest(path);
    }

    @When("{string} asks for {string} while every logger an administrator can raise is at its loudest")
    public void asksForWhileEveryLoggerIsAtItsLoudest(String alias, String path) {
        sessions.actAs(alias);
        askWhileEveryLoggerIsAtItsLoudest(path);
    }

    @Then("the raw answer is a validation problem")
    public void theRawAnswerIsAValidationProblem() {
        assertThat(api.lastResponse().getHeaders().getFirst(HttpHeaders.CONTENT_TYPE)).startsWith("application/problem+json");
        assertThat(api.lastResponse().getBody()).contains("\"type\":\"https://nfnn.cz/problems/validation\"");
    }

    @Then("the backend logged no error")
    public void theBackendLoggedNoError() {
        List<ILoggingEvent> events;
        synchronized (everyLine) {
            events = List.copyOf(everyLine.list);
        }
        assertThat(events.stream().filter(event -> event.getLevel().isGreaterOrEqual(Level.ERROR)).map(event -> event.getLoggerName() + ": " + event.getFormattedMessage()))
                .as("error lines").isEmpty();
    }

    @Then("the backend logged no line holding {string}")
    public void theBackendLoggedNoLineHolding(String text) {
        assertThat(everyLoggedText().stream().filter(line -> line.contains(text)).map(RequestTextLoggingStepDefinitions::head))
                .as("lines holding the text").isEmpty();
    }

    @Then("the backend logged no line holding the access token of {string}")
    public void theBackendLoggedNoLineHoldingTheAccessTokenOf(String alias) {
        theBackendLoggedNoLineHolding(donors.accessTokenOf(alias));
    }

    private void sendRawRequest(String request, Map<String, String> credentials) {
        captureEveryLine();
        String[] headAndBody = request.split("\n\n", 2);
        List<String> head = headAndBody[0].lines().toList();
        String[] requestLine = head.getFirst().split(" ", 2);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HttpHeaders.HOST, RAW_HOST);
        headers.putAll(credentials);
        head.stream().skip(1).filter(header -> !header.isBlank()).forEach(header -> {
            String[] nameAndValue = header.split(":", 2);
            headers.put(nameAndValue[0].strip(), nameAndValue[1].strip());
        });
        api.sendRaw(requestLine[0], requestLine[1], headers, headAndBody.length > 1 ? headAndBody[1].replace("\n", "\r\n") : "");
    }

    private void askWhileEveryLoggerIsAtItsLoudest(String path) {
        captureEveryLine();
        try (RaisedLogLevels raised = loudest()) {
            api.get(path);
        }
    }

    private RaisedLogLevels loudest() {
        return RaisedLogLevels.raise(loggingSystem, RaisedLogLevels.EVERY_LEVEL_AN_ADMINISTRATOR_CAN_SET);
    }

    private void captureEveryLine() {
        assertThat(System.getProperty(TOMCAT_USER_DATA_LOGGING)).as("Tomcat logs every refused request only with " + TOMCAT_USER_DATA_LOGGING
                + "=INFO_ALL, as the Gradle task acceptanceTest sets it; without it a row after the first one can pass unseen").isEqualTo("INFO_ALL");
        if (!rootLogger.isAttached(everyLine)) {
            everyLine.start();
            rootLogger.addAppender(everyLine);
        }
    }

    private static String head(String line) {
        return line.lines().limit(3).reduce((first, next) -> first + " | " + next).orElse("");
    }

    private List<String> everyLoggedText() {
        List<ILoggingEvent> events;
        synchronized (everyLine) {
            events = List.copyOf(everyLine.list);
        }
        return events.stream().map(event -> event.getLevel() + " " + event.getLoggerName() + ": " + event.getFormattedMessage()
                + (event.getThrowableProxy() == null ? "" : System.lineSeparator() + ThrowableProxyUtil.asString(event.getThrowableProxy()))).toList();
    }
}
