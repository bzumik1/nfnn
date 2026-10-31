package cz.novanadeje.app.operations.cucumber;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RaisedLogLevels;
import cz.novanadeje.app.support.RecordingResetTimer;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.LoggingSystem;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

public class ClientErrorReportStepDefinitions {

    private static final String CLIENT_ERRORS = "/api/operations/client-errors";
    private static final String CLIENT_ERROR_LOGGER = "cz.novanadeje.app.operations.clienterrors";
    private static final Duration CAP_WINDOW = Duration.ofHours(1);
    private static final int AFTER_THE_SHARED_SET_UP = 90_000;
    private static final String RAW_HOST = "localhost";

    private final ApiClient api;
    private final MutableClock clock;
    private final RecordingResetTimer timer;
    private final LoggingSystem loggingSystem;
    private final Logger logger = (Logger) LoggerFactory.getLogger(CLIENT_ERROR_LOGGER);
    private final Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
    private ListAppender<ILoggingEvent> lines;
    private ListAppender<ILoggingEvent> everyLine;

    public ClientErrorReportStepDefinitions(ApiClient api, MutableClock clock, RecordingResetTimer timer, LoggingSystem loggingSystem) {
        this.api = api;
        this.clock = clock;
        this.timer = timer;
        this.loggingSystem = loggingSystem;
    }

    @Before(order = AFTER_THE_SHARED_SET_UP)
    public void captureBrowserErrorLines() {
        lines = new ListAppender<>();
        lines.start();
        logger.addAppender(lines);
        everyLine = new ListAppender<>();
        everyLine.start();
        rootLogger.addAppender(everyLine);
    }

    @After
    public void releaseBrowserErrorLines() {
        logger.detachAppender(lines);
        lines.stop();
        rootLogger.detachAppender(everyLine);
        everyLine.stop();
    }

    @When("a browser reports an error")
    public void aBrowserReportsAnError(Map<String, String> fields) {
        Map<String, Object> body = new LinkedHashMap<>();
        fields.forEach((field, value) -> body.put(field, typed(value)));
        report(body);
    }

    @When("a browser reports an error of kind {string}")
    public void aBrowserReportsAnErrorOfKind(String kind) {
        report(validReport(kind));
    }

    @When("a browser reports an error with {string} set to {string}")
    public void aBrowserReportsAnErrorWithSetTo(String field, String value) {
        Map<String, Object> body = validReport("unexpected");
        body.put(field, typed(value));
        report(body);
    }

    @When("a browser reports an error without {string}")
    public void aBrowserReportsAnErrorWithout(String field) {
        Map<String, Object> body = validReport("unexpected");
        body.remove(field);
        report(body);
    }

    @When("a browser sends the raw report {string}")
    public void aBrowserSendsTheRawReport(String json) {
        api.forgetCredentials();
        api.postRaw(CLIENT_ERRORS, json, Map.of("Host", RAW_HOST));
    }

    @When("a browser sends the raw report {string} as {string}")
    public void aBrowserSendsTheRawReportAs(String body, String contentType) {
        api.forgetCredentials();
        api.postRaw(CLIENT_ERRORS, body, Map.of("Host", RAW_HOST, "Content-Type", contentType));
    }

    @When("a browser sends the raw report {string} with the token {string}")
    public void aBrowserSendsTheRawReportWithTheToken(String json, String token) {
        api.forgetCredentials();
        api.postRaw(CLIENT_ERRORS, json, Map.of("Host", RAW_HOST, "Authorization", "Bearer " + token));
    }

    @When("a browser sends the raw report {string} while every framework logger an administrator can raise is at DEBUG")
    public void aBrowserSendsTheRawReportWhileEveryFrameworkLoggerIsAtDebug(String json) {
        try (RaisedLogLevels raised = RaisedLogLevels.raise(loggingSystem, RaisedLogLevels.FRAMEWORK_AT_DEBUG)) {
            aBrowserSendsTheRawReport(json);
        }
    }

    @When("a browser sends the report as a form")
    public void aBrowserSendsTheReportAsAForm() {
        api.forgetCredentials();
        Map<String, String> form = new LinkedHashMap<>();
        validReport("unexpected").forEach((field, value) -> form.put(field, String.valueOf(value)));
        api.postForm(CLIENT_ERRORS, form);
    }

    @When("{int} browser errors of kind {string} arrive from this client address")
    public void browserErrorsOfKindArriveFromThisClientAddress(int reports, String kind) {
        for (int report = 0; report < reports; report++) {
            aBrowserReportsAnErrorOfKind(kind);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(204);
        }
    }

    @When("{int} browser errors of kind {string} arrive from {int} client addresses")
    public void browserErrorsOfKindArriveFromClientAddresses(int reports, String kind, int addresses) {
        int perAddress = Math.ceilDiv(reports, addresses);
        for (int report = 0; report < reports; report++) {
            if (report % perAddress == 0) {
                api.comeFromAnotherAddress();
            }
            aBrowserReportsAnErrorOfKind(kind);
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(204);
        }
    }

    @When("the hour of the browser error cap ends")
    public void theHourOfTheBrowserErrorCapEnds() {
        clock.advance(CAP_WINDOW);
        timer.fireAll();
    }

    @Then("the raw refusal lists an error for field {string}")
    public void theRawRefusalListsAnErrorForField(String field) {
        assertThat(api.lastResponse().getBody()).contains("\"type\":\"https://nfnn.cz/problems/validation\"").contains("\"field\":\"" + field + "\"");
    }

    @Then("no line the backend logged holds {string}")
    public void noLineTheBackendLoggedHolds(String text) {
        assertThat(everyLoggedText()).noneMatch(line -> line.contains(text));
    }

    @Then("no line the backend logged starts with {string}")
    public void noLineTheBackendLoggedStartsWith(String text) {
        assertThat(everyLoggedText().flatMap(String::lines)).noneMatch(line -> line.startsWith(text));
    }

    @Then("the browser error log holds exactly the line {string}")
    public void theBrowserErrorLogHoldsExactlyTheLine(String line) {
        assertThat(loggedLines()).containsExactly(line);
    }

    @Then("the browser error log holds no line")
    public void theBrowserErrorLogHoldsNoLine() {
        assertThat(loggedLines()).isEmpty();
    }

    @Then("the browser error log holds {int} lines")
    public void theBrowserErrorLogHoldsLines(int count) {
        assertThat(loggedLines()).hasSize(count);
    }

    @Then("the browser error log ends with the line {string}")
    public void theBrowserErrorLogEndsWithTheLine(String line) {
        assertThat(loggedLines()).last().isEqualTo(line);
    }

    private void report(Map<String, Object> body) {
        api.forgetCredentials();
        api.post(CLIENT_ERRORS, body);
    }

    private Stream<String> everyLoggedText() {
        List<ILoggingEvent> events;
        synchronized (everyLine) {
            events = List.copyOf(everyLine.list);
        }
        return events.stream().map(event -> event.getFormattedMessage()
                + (event.getThrowableProxy() == null ? "" : System.lineSeparator() + ThrowableProxyUtil.asString(event.getThrowableProxy())));
    }

    private List<String> loggedLines() {
        return lines.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static Map<String, Object> validReport(String kind) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kind", kind);
        body.put("place", "global");
        body.put("name", "Error");
        body.put("appVersion", "dev");
        body.put("browser", "chrome");
        body.put("browserMajor", 131);
        body.put("os", "android");
        body.put("display", "browser");
        body.put("count", 1);
        return body;
    }

    private static Object typed(String value) {
        return value.matches("-?\\d{1,9}") ? Integer.parseInt(value) : value;
    }
}
