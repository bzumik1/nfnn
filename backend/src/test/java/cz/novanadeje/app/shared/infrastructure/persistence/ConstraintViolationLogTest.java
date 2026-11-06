package cz.novanadeje.app.shared.infrastructure.persistence;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

@IntegrationTest
class ConstraintViolationLogTest {

    private static final String CANARY_EMAIL = "kanarek.zpevny@example.cz";
    private static final String CANARY_NAME = "Kanárek Zpěvný";
    private static final String CANARY_STREET = "Ptačí 77";

    @Autowired
    private DonorRepository donors;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();

    @BeforeEach
    void captureEveryLogEvent() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        logged.start();
        rootLogger().addAppender(logged);
    }

    @AfterEach
    void stopCapturing() {
        rootLogger().detachAppender(logged);
        logged.stop();
    }

    @Test
    @DisplayName("Given a donor with an e-mail address, when another donor is saved with the same address, then the refusal names the constraint and neither the log nor the failure carries the address")
    void should_keep_address_out_of_log_and_failure_when_saved_given_address_taken() {
        inTransaction(() -> donors.save(donor(CANARY_EMAIL, "4821937560")));

        Throwable failure = catchThrowable(() -> inTransaction(() -> donors.save(donor(CANARY_EMAIL, "4821937561"))));

        assertThat(failure).isNotNull();
        assertThat(messagesOf(failure)).noneMatch(message -> message.contains(CANARY_EMAIL));
        assertThat(loggedTexts()).anyMatch(text -> text.contains("uq_donor_email"));
        assertThat(loggedTexts()).noneMatch(text -> text.contains(CANARY_EMAIL) || text.contains(CANARY_STREET));
    }

    @Test
    @DisplayName("Given a row without its required columns, when it is inserted, then the failure names no value of the refused row")
    void should_name_no_value_of_the_row_when_inserted_given_required_column_missing() {
        Throwable failure = catchThrowable(() -> jdbc.sql("insert into donor (id, type, name) values (?, 'PERSON', ?)")
                .params(UUID.randomUUID(), CANARY_NAME).update());

        assertThat(failure).isNotNull();
        assertThat(messagesOf(failure)).anyMatch(message -> message.contains("not-null"));
        assertThat(messagesOf(failure)).noneMatch(message -> message.contains(CANARY_NAME));
        assertThat(loggedTexts()).noneMatch(text -> text.contains(CANARY_NAME));
    }

    private Donor donor(String email, String symbol) {
        Instant now = clock.instant();
        return Donor.register(DonorId.newId(now), DonorType.PERSON, CANARY_NAME, null, new PostalAddress(CANARY_STREET, "Most", "434 01"),
                new EmailAddress(email), null, new VariableSymbol(symbol), LocaleCode.CS, now);
    }

    private List<String> loggedTexts() {
        List<String> texts = new ArrayList<>();
        for (ILoggingEvent event : List.copyOf(logged.list)) {
            texts.add(event.getLoggerName() + " " + event.getFormattedMessage());
            addThrowableTexts(event.getThrowableProxy(), texts);
        }
        return texts;
    }

    private static void addThrowableTexts(IThrowableProxy proxy, List<String> texts) {
        if (proxy == null) {
            return;
        }
        texts.add(String.valueOf(proxy.getMessage()));
        addThrowableTexts(proxy.getCause(), texts);
        for (IThrowableProxy suppressed : proxy.getSuppressed()) {
            addThrowableTexts(suppressed, texts);
        }
    }

    private static List<String> messagesOf(Throwable failure) {
        List<String> messages = new ArrayList<>();
        addMessages(failure, messages);
        return messages;
    }

    private static void addMessages(Throwable failure, List<String> messages) {
        if (failure == null || messages.size() > 50) {
            return;
        }
        messages.add(String.valueOf(failure.getMessage()));
        messages.add(failure.toString());
        if (failure instanceof SQLException sql) {
            addMessages(sql.getNextException(), messages);
        }
        for (Throwable suppressed : failure.getSuppressed()) {
            addMessages(suppressed, messages);
        }
        if (failure.getCause() != failure) {
            addMessages(failure.getCause(), messages);
        }
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }

    private static Logger rootLogger() {
        return (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    }
}
