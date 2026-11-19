package cz.novanadeje.app.operations.infrastructure.loggers;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Donors;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.operations.application.loggers.LogLevelService;
import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class RaisedLibraryLoggersTest {

    private static final String CANARY_NAME = "Kanárek Zpěvný";
    private static final String CANARY_EMAIL = "kanarek.zpevny@example.cz";
    private static final String CANARY_STREET = "Ptačí 77";
    private static final String CANARY_PASSWORD_HASH = "$2a$12$kanarekzpevnyhesloprotestovanilogu";
    private static final String CANARY_TOTP_SECRET = "KANAREKZPEVNYKANAREKZPEVNYKANARE";
    private static final String CANARY_SMTP_USER = "kanarek-smtp-ucet";
    private static final List<String> CANARIES = List.of(CANARY_NAME, CANARY_EMAIL, CANARY_STREET, CANARY_PASSWORD_HASH, CANARY_TOTP_SECRET,
            CANARY_SMTP_USER);

    @Autowired
    private LogLevelService logLevels;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private final UUID adminId = UUID.randomUUID();
    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
    private ServerSocket mailServer;

    @BeforeEach
    void captureEveryLogEvent() throws IOException {
        new DatabaseCleaner(jdbc).emptyAllTables();
        mailServer = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        Thread.ofVirtual().start(this::acceptMail);
        logged.start();
        rootLogger().addAppender(logged);
    }

    @AfterEach
    void stopCapturing() throws IOException {
        rootLogger().detachAppender(logged);
        logged.stop();
        mailServer.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {LoggerName.ROOT, "org", "org.hibernate", "org.hibernate.orm", "org.eclipse", "org.eclipse.angus"})
    @DisplayName("Given a parent of the library loggers raised to DEBUG by an administrator, when a donor with a second factor is saved and read and an e-mail is sent, then no log line carries the donor's data, the password hash, the TOTP secret, the recipient or the SMTP user")
    void should_keep_rows_and_mail_traffic_out_of_log_when_raised_to_debug_given_parent_of_library_loggers(String name) throws MessagingException {
        LoggerName logger = new LoggerName(name);
        logLevels.override(adminId, logger, LogLevel.DEBUG, 5);
        try {
            DonorId donorId = saveDonorWithSecondFactor();
            readDonorAndSecondFactor(donorId);
            sendMail();
        } finally {
            logLevels.reset(adminId, logger);
        }

        assertThat(loggedTexts()).isNotEmpty();
        assertThat(loggedTexts()).filteredOn(text -> CANARIES.stream().anyMatch(text::contains)).isEmpty();
    }

    private DonorId saveDonorWithSecondFactor() {
        Instant now = clock.instant();
        DonorId donorId = DonorId.newId(now);
        inTransaction(() -> {
            donors.save(Donors.withPassword(Donor.register(donorId, DonorType.PERSON, new DonorName(CANARY_NAME), new PostalAddress(CANARY_STREET, "Most", "434 01"),
                    new EmailAddress(CANARY_EMAIL), new VariableSymbol("4821937560"), LocaleCode.CS, now), new PasswordHash(CANARY_PASSWORD_HASH)));
            secondFactors.save(SecondFactor.enrol(donorId, new TotpSecret(CANARY_TOTP_SECRET), now));
        });
        return donorId;
    }

    private void readDonorAndSecondFactor(DonorId donorId) {
        inTransaction(() -> {
            assertThat(donors.findByEmailForUpdate(new EmailAddress(CANARY_EMAIL))).isPresent();
            assertThat(secondFactors.findByDonor(donorId)).isPresent();
        });
    }

    private void sendMail() throws MessagingException {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(mailServer.getInetAddress().getHostAddress());
        sender.setPort(mailServer.getLocalPort());
        sender.setUsername(CANARY_SMTP_USER);
        sender.setPassword("heslo-k-smtp");
        Properties properties = new Properties();
        properties.setProperty("mail.smtp.auth", "true");
        properties.setProperty("mail.smtp.connectiontimeout", "5000");
        properties.setProperty("mail.smtp.timeout", "5000");
        sender.setJavaMailProperties(properties);
        MimeMessage message = sender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
        helper.setFrom("info@nfnn.cz");
        helper.setTo(CANARY_EMAIL);
        helper.setSubject("Obnova hesla");
        helper.setText("Odkaz na obnovu hesla");
        sender.send(message);
    }

    private void acceptMail() {
        try (Socket client = mailServer.accept()) {
            BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
            PrintWriter out = new PrintWriter(client.getOutputStream(), true, StandardCharsets.US_ASCII);
            reply(out, "220 sink.example ESMTP");
            boolean inData = false;
            String line;
            while ((line = in.readLine()) != null) {
                if (inData) {
                    if (line.equals(".")) {
                        inData = false;
                        reply(out, "250 Queued");
                    }
                    continue;
                }
                String command = line.toUpperCase(Locale.ROOT);
                if (command.startsWith("EHLO")) {
                    reply(out, "250-sink.example\r\n250 AUTH PLAIN LOGIN");
                } else if (command.startsWith("AUTH")) {
                    reply(out, "235 Authenticated");
                } else if (command.startsWith("DATA")) {
                    inData = true;
                    reply(out, "354 Go ahead");
                } else if (command.startsWith("QUIT")) {
                    reply(out, "221 Bye");
                    return;
                } else {
                    reply(out, "250 OK");
                }
            }
        } catch (IOException closed) {
            return;
        }
    }

    private static void reply(PrintWriter out, String line) {
        out.print(line + "\r\n");
        out.flush();
    }

    private List<String> loggedTexts() {
        List<String> texts = new ArrayList<>();
        for (ILoggingEvent event : List.copyOf(logged.list)) {
            texts.add(event.getLoggerName() + " " + event.getFormattedMessage());
        }
        return texts;
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    private static Logger rootLogger() {
        return (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    }
}
