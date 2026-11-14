package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.DeviceWipe;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.RateLimiterWindows;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.logging.LogLevel;
import org.springframework.boot.logging.LoggerConfiguration;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class DeviceStatusLoggingTest {

    private static final String STATUS_PATH = "/api/donors/devices/status";
    private static final String CLIENT_ADDRESS = "2001:db8:5d:78::5";
    private static final String CLIENT_NETWORK = "2001:db8:5d:78";
    private static final String CANARY = "Device status logging canary";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Map<String, LogLevel> PRODUCTION_LEVELS = Map.of(
            "cz.novanadeje.app", LogLevel.INFO,
            "org.springframework.web", LogLevel.INFO,
            "org.hibernate.SQL", LogLevel.INFO);
    private static final Map<String, LogLevel> RAISED_LEVELS = Map.of(
            "cz.novanadeje.app", LogLevel.TRACE,
            LoggingSystem.ROOT_LOGGER_NAME, LogLevel.DEBUG,
            "org.springframework.web", LogLevel.DEBUG,
            "org.springframework.security", LogLevel.DEBUG,
            "org.hibernate.SQL", LogLevel.DEBUG);

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private DonorDeviceRepository devices;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;
    @Autowired
    private LoggingSystem logging;
    @Autowired
    private ConfigurableApplicationContext context;

    private final List<Runnable> levelRestorers = new ArrayList<>();
    private final Set<String> answered = new HashSet<>();

    @BeforeEach
    void startFromEmptyTablesAndFreshWindows() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        RateLimiterWindows.reset(context);
    }

    @AfterEach
    void restoreLevelsAndWindows() {
        levelRestorers.reversed().forEach(Runnable::run);
        levelRestorers.clear();
        RateLimiterWindows.reset(context);
    }

    @Test
    @DisplayName("Given the production log levels, when every status is asked, refused as invalid and refused for the rate limit, then not one line is written")
    void should_write_no_line_when_statuses_asked_refused_and_limited_given_production_levels(CapturedOutput output) throws Exception {
        List<String> secrets = devicesOfEveryStatus();
        PRODUCTION_LEVELS.forEach(this::setLevel);
        int start = afterCanary(output);

        List<Integer> answers = askEveryKindOfQuestion(secrets);

        assertThat(answers).contains(200, 400, 429);
        assertThat(answered).containsExactlyInAnyOrder("signed-in", "signed-out", "wipe-all", "wipe-admin", "unknown");
        assertThat(output.getAll().substring(start)).isEmpty();
    }

    @Test
    @DisplayName("Given the application's loggers at TRACE and ROOT, Spring web, Spring Security and Hibernate SQL at DEBUG, when statuses are asked, refused and limited, then no line names a secret, its hash, the client address or its network")
    void should_name_no_secret_nor_address_when_statuses_asked_given_every_level_an_administrator_can_set(CapturedOutput output) throws Exception {
        List<String> secrets = devicesOfEveryStatus();
        RAISED_LEVELS.forEach(this::setLevel);
        int start = afterCanary(output);

        List<Integer> answers = askEveryKindOfQuestion(secrets);

        assertThat(answers).contains(200, 400, 429);
        String written = output.getAll().substring(start);
        for (String secret : secrets) {
            assertThat(written).doesNotContain(secret, secret.substring(0, 16), new DeviceStatusSecret(secret).hash());
        }
        assertThat(written.toLowerCase()).doesNotContain(CLIENT_ADDRESS, CLIENT_NETWORK);
    }

    private List<Integer> askEveryKindOfQuestion(List<String> secrets) throws Exception {
        String secret = secrets.getFirst();
        List<Integer> answers = new ArrayList<>();
        for (String held : secrets) {
            answers.add(ask("{\"deviceSecret\":\"" + held + "\"}"));
        }
        answers.add(ask("{\"deviceSecret\":\"" + secret + "A\"}"));
        answers.add(ask("{\"deviceSecret\":\"" + secret.substring(1) + "+\"}"));
        answers.add(ask("{\"deviceSecret\":" + secret + "}"));
        answers.add(ask("{}"));
        for (int question = 0; question < 61 && !answers.contains(429); question++) {
            answers.add(ask("{\"deviceSecret\":\"" + secret + "\"}"));
        }
        return answers;
    }

    private int ask(String body) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post(STATUS_PATH).header("X-Forwarded-For", CLIENT_ADDRESS)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse();
        if (response.getStatus() == 200) {
            answered.add(JSON.readTree(response.getContentAsString()).get("status").asString());
        }
        return response.getStatus();
    }

    private List<String> devicesOfEveryStatus() {
        Instant now = clock.instant();
        Donor jana = Donor.register(DonorId.newId(now), DonorType.PERSON, new DonorName("Jana Nováková"), null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"), new PasswordHash("$hash"),
                new VariableSymbol("4821937561"), LocaleCode.CS, now);
        donors.save(jana);
        List<String> secrets = new ArrayList<>();
        secrets.add(device(jana.id(), now, null, null, null));
        secrets.add(device(jana.id(), now, now, DeviceSignOutReason.SIGNED_OUT, null));
        secrets.add(device(jana.id(), now, now, DeviceSignOutReason.REMOTE_SIGN_OUT, DeviceWipe.ALL));
        secrets.add(device(jana.id(), now, now, DeviceSignOutReason.ADMINISTRATION_CHANGED, DeviceWipe.ADMINISTRATION));
        secrets.add(DeviceStatusSecret.generate().value());
        return secrets;
    }

    private String device(DonorId donor, Instant now, Instant endedAt, DeviceSignOutReason reason, DeviceWipe wipe) {
        DeviceStatusSecret secret = DeviceStatusSecret.generate();
        devices.save(DonorDevice.reconstitute(DeviceId.newId(now), donor, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, now, now, endedAt, reason,
                secret.hash(), wipe));
        return secret.value();
    }

    private int afterCanary(CapturedOutput output) {
        LoggerFactory.getLogger(DeviceStatusLoggingTest.class).info(CANARY);
        assertThat(output.getAll()).as("the capture sees the application's log lines").contains(CANARY);
        return output.getAll().length();
    }

    private void setLevel(String logger, LogLevel level) {
        LoggerConfiguration before = logging.getLoggerConfiguration(logger);
        LogLevel configured = before == null ? null : before.getConfiguredLevel();
        levelRestorers.add(() -> logging.setLogLevel(logger, configured));
        logging.setLogLevel(logger, level);
    }
}
