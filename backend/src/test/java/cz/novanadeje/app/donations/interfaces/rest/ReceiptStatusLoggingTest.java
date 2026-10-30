package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.receipt.DonationReceiptIssuer;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.RateLimiterWindows;
import cz.novanadeje.app.support.ServerReceiptSigningKey;
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
import org.springframework.test.web.servlet.MockMvc;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class ReceiptStatusLoggingTest {

    private static final String STATUS_PATH = "/api/donations/receipts/status";
    private static final String CLIENT_ADDRESS = "2001:db8:5c:77::5";
    private static final String CLIENT_NETWORK = "2001:db8:5c:77";
    private static final String UNKNOWN_DIGEST = "5ca1ab1e".repeat(8);
    private static final String CANARY = "Receipt status logging canary";
    private static final Map<String, LogLevel> PRODUCTION_LEVELS = Map.of(
            "cz.novanadeje.app", LogLevel.INFO,
            "org.springframework.web", LogLevel.INFO,
            "org.hibernate.SQL", LogLevel.INFO);

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private DonationReceiptIssuer issuer;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;
    @Autowired
    private LoggingSystem logging;
    @Autowired
    private ConfigurableApplicationContext context;

    private final List<Runnable> levelRestorers = new ArrayList<>();

    @BeforeEach
    void startFromEmptyTablesAndFreshWindows() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        ServerReceiptSigningKey.storeAfterEmptyTables(context);
        RateLimiterWindows.reset(context);
    }

    @AfterEach
    void restoreLevelsAndWindows() {
        levelRestorers.reversed().forEach(Runnable::run);
        levelRestorers.clear();
        RateLimiterWindows.reset(context);
    }

    @Test
    @DisplayName("Given the production log levels, when receipts' statuses are asked, refused as invalid and refused for the rate limit, then not one line is written")
    void should_write_no_line_when_statuses_asked_refused_and_limited_given_production_levels(CapturedOutput output) throws Exception {
        String digest = issuedReceiptDigest();
        PRODUCTION_LEVELS.forEach(this::setLevel);
        int start = afterCanary(output);

        List<Integer> answers = askEveryKindOfQuestion(digest);

        assertThat(answers).contains(200, 400, 429);
        assertThat(output.getAll().substring(start)).isEmpty();
    }

    @Test
    @DisplayName("Given the application's loggers at TRACE, when receipts' statuses are asked, refused and limited, then no line names the digest, the client address or its network")
    void should_name_no_digest_nor_address_when_statuses_asked_given_application_loggers_at_trace(CapturedOutput output) throws Exception {
        String digest = issuedReceiptDigest();
        setLevel("cz.novanadeje.app", LogLevel.TRACE);
        int start = afterCanary(output);

        List<Integer> answers = askEveryKindOfQuestion(digest);

        assertThat(answers).contains(200, 400, 429);
        String written = output.getAll().substring(start).toLowerCase();
        assertThat(written).doesNotContain(digest, UNKNOWN_DIGEST, digest.substring(0, 16), CLIENT_ADDRESS, CLIENT_NETWORK);
    }

    private List<Integer> askEveryKindOfQuestion(String digest) throws Exception {
        List<Integer> answers = new ArrayList<>();
        answers.add(ask("{\"digest\":\"" + digest + "\"}"));
        answers.add(ask("{\"digest\":\"" + UNKNOWN_DIGEST + "\"}"));
        answers.add(ask("{\"digest\":\"" + digest.toUpperCase() + "\"}"));
        answers.add(ask("{\"digest\":\"" + digest + digest + "\"}"));
        answers.add(ask("{\"digest\":" + digest + "}"));
        answers.add(ask("{}"));
        for (int question = 0; question < 61 && !answers.contains(429); question++) {
            answers.add(ask("{\"digest\":\"" + digest + "\"}"));
        }
        return answers;
    }

    private int ask(String body) throws Exception {
        return mockMvc.perform(post(STATUS_PATH).header("X-Forwarded-For", CLIENT_ADDRESS).contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getStatus();
    }

    private int afterCanary(CapturedOutput output) {
        LoggerFactory.getLogger(ReceiptStatusLoggingTest.class).info(CANARY);
        assertThat(output.getAll()).as("the capture sees the application's log lines").contains(CANARY);
        return output.getAll().length();
    }

    private void setLevel(String logger, LogLevel level) {
        LoggerConfiguration before = logging.getLoggerConfiguration(logger);
        LogLevel configured = before == null ? null : before.getConfiguredLevel();
        levelRestorers.add(() -> logging.setLogLevel(logger, configured));
        logging.setLogLevel(logger, level);
    }

    private String issuedReceiptDigest() {
        Instant now = clock.instant();
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(now)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, now);
        donorRecords.save(jana);
        BankPayment paid = payment(7101, LocalDate.of(2026, 3, 15), Money.czk(50000), Optional.of(new SenderAccount("2900233333", "2010")), null);
        payments.saveAll(List.of(paid));
        Donation donation = Donation.fromBankPayment(DonationId.newId(now), jana.id(), paid, PairingMethod.VARIABLE_SYMBOL, now);
        donations.save(donation);
        return issuer.issueForDonation(jana.id(), donation.id(), FoundationCalendar.today(clock)).frozen().statusDigest().value();
    }
}
