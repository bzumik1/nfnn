package cz.novanadeje.app.donors.application;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.zaxxer.hikari.HikariDataSource;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactorCodesPaused;
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

import javax.sql.DataSource;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class WrongSecondFactorCodeCountTest {

    private static final int CALLERS = 30;
    private static final Duration WELL_WITHIN_THE_POOL_TIMEOUT = Duration.ofSeconds(15);

    @Autowired
    private WrongSecondFactorCodeCount wrongCodes;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private Clock clock;

    private Donor jana;
    private ListAppender<ILoggingEvent> logged;
    private Logger countLog;

    @BeforeEach
    void aDonor() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jana = Donor.register(DonorId.newId(clock.instant()), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("jana@example.cz"), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, clock.instant());
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> donors.save(jana));
        countLog = (Logger) LoggerFactory.getLogger(WrongSecondFactorCodeCount.class);
        logged = new ListAppender<>();
        logged.start();
        countLog.addAppender(logged);
    }

    @AfterEach
    void releaseLog() {
        countLog.detachAppender(logged);
    }

    @Test
    @DisplayName("Given thirty code checks of one donor at the same moment, when each reserves its check, then exactly ten are reserved, the rest are refused as paused and the pause is started and logged once")
    void should_reserve_exactly_ten_and_start_one_pause_when_reserved_at_once_given_thirty_checks() throws Exception {
        Instant now = clock.instant();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService callers = Executors.newFixedThreadPool(CALLERS);
        try {
            List<Future<Boolean>> outcomes = new ArrayList<>();
            for (int i = 0; i < CALLERS; i++) {
                outcomes.add(callers.submit(() -> {
                    start.await(30, TimeUnit.SECONDS);
                    try {
                        wrongCodes.reserve(jana.id(), now);
                        return true;
                    } catch (SecondFactorCodesPaused paused) {
                        return false;
                    }
                }));
            }
            start.countDown();
            List<Boolean> reserved = new ArrayList<>();
            for (Future<Boolean> outcome : outcomes) {
                reserved.add(outcome.get(60, TimeUnit.SECONDS));
            }

            assertThat(reserved).filteredOn(Boolean::booleanValue).hasSize(10);
            assertThat(logged.list).filteredOn(line -> line.getLevel() == Level.WARN).singleElement()
                    .satisfies(line -> assertThat(line.getFormattedMessage())
                            .isEqualTo("Second factor codes of donor " + jana.id() + " are paused for an hour after 10 wrong codes"));
        } finally {
            callers.shutdownNow();
        }
    }

    @Test
    @DisplayName("Given more code checks of one donor inside open callers' transactions than the pool has connections, when each reserves its check, then each uses its caller's connection, all finish well within the pool's timeout and exactly ten are reserved")
    void should_finish_well_within_the_pool_timeout_when_reserved_given_more_open_callers_than_pool_connections() throws Exception {
        int burst = dataSource.unwrap(HikariDataSource.class).getMaximumPoolSize() + 5;
        Instant now = clock.instant();
        CyclicBarrier together = new CyclicBarrier(burst);
        ExecutorService callers = Executors.newFixedThreadPool(burst);
        long started = System.nanoTime();
        try {
            List<Future<Boolean>> outcomes = new ArrayList<>();
            for (int i = 0; i < burst; i++) {
                outcomes.add(callers.submit(() -> {
                    together.await(30, TimeUnit.SECONDS);
                    return new TransactionTemplate(transactionManager).execute(status -> {
                        try {
                            wrongCodes.reserve(jana.id(), now);
                            return true;
                        } catch (SecondFactorCodesPaused paused) {
                            return false;
                        }
                    });
                }));
            }
            List<Boolean> reserved = new ArrayList<>();
            for (Future<Boolean> outcome : outcomes) {
                reserved.add(outcome.get(WELL_WITHIN_THE_POOL_TIMEOUT.toSeconds() * 2, TimeUnit.SECONDS));
            }

            assertThat(reserved).filteredOn(Boolean::booleanValue).hasSize(10);
            assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(WELL_WITHIN_THE_POOL_TIMEOUT);
        } finally {
            callers.shutdownNow();
        }
    }
}
