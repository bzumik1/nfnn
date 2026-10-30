package cz.novanadeje.app.donations.cucumber;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeyRegistration;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.operations.infrastructure.backup.BackupProperties;
import cz.novanadeje.app.operations.infrastructure.settings.EarlierServerSeals;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class ReceiptKeysStepDefinitions {

    private static final String RECEIPT_KEYS = "/api/donations/receipt-keys";
    private static final String ADMIN_RECEIPT_KEYS = "/api/admin/donations/receipt-signing-keys";
    private static final String EARLIER_PUBLIC_KEY = "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
    private static final String EARLIER_SETTINGS_KEY = Base64.getEncoder().encodeToString("an-earlier-server-settings-key!!".getBytes(StandardCharsets.US_ASCII));
    private static final String APPLICATION_LOGGERS = "cz.novanadeje.app";
    private static final List<String> KEY_LOGGERS = List.of(ReceiptSigningKeyRegistration.class.getName(),
            "cz.novanadeje.app.donations.infrastructure.signing.ReceiptSigningKeyStartup");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ReceiptSigningKeyRegistration registration;
    private final JdbcClient jdbc;
    private final Environment environment;
    private final ConfigurableApplicationContext context;
    private final Clock clock;
    private final Path restoreStatus;
    private final List<String> loggedErrors = new ArrayList<>();
    private String visitorAnswer;

    public ReceiptKeysStepDefinitions(ApiClient api, DonorSessions sessions, ReceiptSigningKeyRegistration registration, JdbcClient jdbc,
                                      Environment environment, ConfigurableApplicationContext context, Clock clock, BackupProperties backups) {
        this.api = api;
        this.sessions = sessions;
        this.registration = registration;
        this.jdbc = jdbc;
        this.environment = environment;
        this.context = context;
        this.clock = clock;
        this.restoreStatus = backups.directory().resolve("status").resolve("restore");
    }

    @Given("the server has started and registered its receipt signing key")
    public void theServerHasStarted() {
        theServerStartsAgain();
    }

    @When("the server starts again")
    public void theServerStartsAgain() {
        whileLogging(registration::registerOwnKey);
    }

    @When("the backend is ready")
    public void theBackendIsReady() {
        whileOnlyKeyLinesAreLogged(() -> whileLogging(
                () -> context.publishEvent(new ApplicationReadyEvent(new SpringApplication(), new String[0], context, Duration.ZERO))));
    }

    private static void whileOnlyKeyLinesAreLogged(Runnable start) {
        Logger application = (Logger) LoggerFactory.getLogger(APPLICATION_LOGGERS);
        List<Logger> keyLoggers = KEY_LOGGERS.stream().map(name -> (Logger) LoggerFactory.getLogger(name)).toList();
        Level applicationLevel = application.getLevel();
        List<Level> keyLevels = keyLoggers.stream().map(Logger::getLevel).toList();
        Level effective = application.getEffectiveLevel();
        keyLoggers.forEach(logger -> logger.setLevel(effective));
        application.setLevel(Level.OFF);
        try {
            start.run();
        } finally {
            application.setLevel(applicationLevel);
            for (int index = 0; index < keyLoggers.size(); index++) {
                keyLoggers.get(index).setLevel(keyLevels.get(index));
            }
        }
    }

    @Given("the backup container finished that restore {int} minutes ago under the request {string}")
    public void theBackupContainerFinishedThatRestore(int minutes, String requestId) throws IOException {
        Instant finished = clock.instant().minus(Duration.ofMinutes(minutes));
        Files.createDirectories(restoreStatus.getParent());
        Files.writeString(restoreStatus, "outcome=ok\nstarted_at=" + finished.minusSeconds(40) + "\nfinished_at=" + finished
                + "\nfile=nfnn-2026-11-01_0300.dump.age\nsize=1000\ntables=37\nrequest=" + requestId + "\nadmin=\n");
    }

    private void whileLogging(Runnable start) {
        Logger logger = (Logger) LoggerFactory.getLogger(ReceiptSigningKeyRegistration.class);
        ListAppender<ILoggingEvent> lines = new ListAppender<>();
        lines.start();
        logger.addAppender(lines);
        try {
            start.run();
        } finally {
            logger.detachAppender(lines);
        }
        lines.list.stream().filter(line -> line.getLevel() == Level.ERROR).map(ILoggingEvent::getFormattedMessage).forEach(loggedErrors::add);
    }

    @Given("the receipt signing key {string} was altered in the database to look revoked")
    public void theReceiptSigningKeyWasAltered(String keyId) {
        assertThat(jdbc.sql("update receipt_signing_key set status = 'revoked' where key_id = ?").param(keyId).update()).isEqualTo(1);
    }

    @Given("the public key of the receipt signing key {string} was replaced in the database by another key's")
    public void thePublicKeyWasReplaced(String keyId) {
        assertThat(jdbc.sql("update receipt_signing_key set public_key = ? where key_id = ?").params(HexFormat.of().parseHex(EARLIER_PUBLIC_KEY), keyId)
                .update()).isEqualTo(1);
    }

    @Given("the registration time of the receipt signing key {string} was replaced in the database by {string}")
    public void theRegistrationTimeWasReplaced(String keyId, String registeredAt) {
        assertThat(jdbc.sql("update receipt_signing_key set registered_at = ? where key_id = ?").params(Timestamp.from(Instant.parse(registeredAt)), keyId)
                .update()).isEqualTo(1);
    }

    @Given("a row for the receipt signing key {string} was added in the database with the seal of {string}")
    public void aRowWasAddedWithTheSealOf(String keyId, String sealedKeyId) {
        String seal = jdbc.sql("select seal from receipt_signing_key where key_id = ?").param(sealedKeyId).query(String.class).single();
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) values (?, ?, ?, 'active', ?)")
                .params(keyId, HexFormat.of().parseHex(EARLIER_PUBLIC_KEY), Timestamp.from(Instant.parse("2026-11-01T07:00:00Z")), seal).update();
    }

    @Given("a backup of an earlier server with its receipt signing key registered at {string} was restored")
    public void aBackupOfAnEarlierServerWasRestored(String registeredAt) {
        EarlierServerSeals earlier = EarlierServerSeals.of(EARLIER_SETTINGS_KEY, environment.getRequiredProperty("app.operations.backup-key.value"));
        ReceiptSigningKey key = ReceiptSigningKey.register(HexFormat.of().parseHex(EARLIER_PUBLIC_KEY), Instant.parse(registeredAt),
                content -> earlier.seal(ReceiptSigningKey.SEAL_PURPOSE, content));
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) values (?, ?, ?, 'active', ?)")
                .params(key.id().value(), key.publicKey(), Timestamp.from(key.registeredAt()), key.seal()).update();
        jdbc.sql("delete from operations_carried_settings_key").update();
        jdbc.sql("insert into operations_carried_settings_key (id, wrapped, stored_at) values (1, ?, ?)")
                .params(earlier.carriedSettingsKey(key.registeredAt()), Timestamp.from(key.registeredAt())).update();
    }

    @When("a visitor asks for the receipt keys")
    public void aVisitorAsksForTheReceiptKeys() {
        api.forgetCredentials();
        api.get(RECEIPT_KEYS);
        visitorAnswer = api.lastResponse().getBody();
    }

    @When("a visitor asked for the receipt keys {int} times")
    public void aVisitorAskedForTheReceiptKeysTimes(int times) {
        for (int request = 0; request < times; request++) {
            aVisitorAsksForTheReceiptKeys();
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("{string} asks for the receipt keys")
    public void asksForTheReceiptKeys(String alias) {
        sessions.actAs(alias);
        api.get(RECEIPT_KEYS);
    }

    @When("a visitor asks for the receipt keys again with the entity tag of the last answer")
    public void aVisitorAsksAgainWithTheEntityTag() {
        String entityTag = api.lastResponse().getHeaders().getETag();
        assertThat(entityTag).isNotBlank();
        api.forgetCredentials();
        api.sendHeader(HttpHeaders.IF_NONE_MATCH, entityTag);
        api.get(RECEIPT_KEYS);
        api.forgetCredentials();
    }

    @When("{string} asks for the receipt signing keys")
    public void asksForTheReceiptSigningKeys(String alias) {
        sessions.actAs(alias);
        api.get(ADMIN_RECEIPT_KEYS);
    }

    @When("someone without a token asks for the receipt signing keys")
    public void someoneWithoutATokenAsksForTheReceiptSigningKeys() {
        api.forgetCredentials();
        api.get(ADMIN_RECEIPT_KEYS);
    }

    @Then("the receipt keys are those of the foundation {string} {string}:")
    public void theReceiptKeysAre(String name, String companyIdentifier, DataTable expected) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("foundation").get("name").asString()).isEqualTo(name);
        assertThat(answer.get("foundation").get("companyIdentifier").asString()).isEqualTo(companyIdentifier);
        assertThat(answer.get("keys").values().stream().map(ReceiptKeysStepDefinitions::rowOf).toList()).isEqualTo(expected.asMaps());
    }

    @Then("the answer may be kept by any cache for an hour")
    public void theAnswerMayBeKeptByAnyCacheForAnHour() {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getCacheControl()).isEqualTo("public, max-age=3600");
        assertThat(headers.getETag()).isNotBlank();
        assertThat(headers.get(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Then("the answer is the one a visitor gets")
    public void theAnswerIsTheOneAVisitorGets() {
        assertThat(api.lastResponse().getBody()).isEqualTo(visitorAnswer);
    }

    @Then("the server logged the error {string}")
    public void theServerLoggedTheError(String message) {
        assertThat(loggedErrors).contains(message);
    }

    @Then("the server logged no error")
    public void theServerLoggedNoError() {
        assertThat(loggedErrors).isEmpty();
    }

    @Then("the current receipt signing key is {string}, published: {word}")
    public void theCurrentReceiptSigningKeyIs(String keyId, String published) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("currentKeyId").asString()).isEqualTo(keyId);
        assertThat(answer.get("currentKeyPublished").asBoolean()).isEqualTo(Boolean.parseBoolean(published));
    }

    @Then("the receipt signing keys are:")
    public void theReceiptSigningKeysAre(DataTable expected) {
        assertThat(api.lastResponseJson().get("keys").values().stream().map(key -> Map.of(
                "keyId", key.get("keyId").asString(),
                "status", key.get("status").asString(),
                "registeredAt", key.get("registeredAt").asString(),
                "published", key.get("published").asString(),
                "current", key.get("current").asString())).toList()).isEqualTo(expected.asMaps());
    }

    @Then("the server's admin action {string} is recorded {int} time(s) with details containing {string}")
    public void theServersAdminActionIsRecorded(String action, int times, String details) {
        List<String> recorded = jdbc.sql("select details from admin_action where action = ? and admin_id = ?")
                .param(action).param(AdminActionPerformed.SERVER).query(String.class).list();
        assertThat(recorded).hasSize(times).allSatisfy(recordedDetails -> assertThat(recordedDetails).contains(details));
    }

    private static Map<String, String> rowOf(JsonNode key) {
        return Map.of(
                "keyId", key.get("keyId").asString(),
                "algorithm", key.get("algorithm").asString(),
                "publicKey", key.get("publicKey").asString(),
                "status", key.get("status").asString(),
                "registeredAt", key.get("registeredAt").asString());
    }
}
