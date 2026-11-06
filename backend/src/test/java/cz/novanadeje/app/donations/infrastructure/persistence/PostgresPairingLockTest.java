package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class PostgresPairingLockTest {

    @Autowired
    private PairingLock lock;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("Given another session holding the pairing lock, when a transaction's wait for it runs out, then the failure is the pessimistic locking failure every caller handles")
    void should_fail_as_pessimistic_locking_failure_when_wait_runs_out_given_lock_held_elsewhere() throws Exception {
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService holder = Executors.newSingleThreadExecutor();
        try {
            Future<?> holding = holder.submit(() -> holdPairingLock(held, release));
            assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();

            assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbc.sql("set local lock_timeout = '200ms'").update();
                lock.acquire();
            })).isInstanceOf(PessimisticLockingFailureException.class);

            release.countDown();
            holding.get(30, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            holder.shutdownNow();
        }
    }

    private Void holdPairingLock(CountDownLatch held, CountDownLatch release) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.execute("select pg_advisory_xact_lock(" + AdvisoryLock.PAIRING.key() + ")");
            }
            held.countDown();
            release.await(30, TimeUnit.SECONDS);
            connection.rollback();
        }
        return null;
    }
}
