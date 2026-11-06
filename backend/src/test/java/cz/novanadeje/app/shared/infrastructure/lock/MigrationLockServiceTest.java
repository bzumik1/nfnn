package cz.novanadeje.app.shared.infrastructure.lock;

import cz.novanadeje.app.IntegrationTest;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.LockException;
import liquibase.lockservice.LockService;
import liquibase.lockservice.LockServiceFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.liquibase.autoconfigure.LiquibaseDataSource;
import org.springframework.jdbc.core.simple.JdbcClient;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class MigrationLockServiceTest {

    private static final String GONE_MIGRATION = "a backend that died while it migrated";

    @Autowired
    private DataSource dataSource;
    @Autowired
    @LiquibaseDataSource
    private DataSource migrationDataSource;
    @Autowired
    private JdbcClient jdbc;

    private final List<Database> databases = new ArrayList<>();
    private final List<Connection> sessions = new ArrayList<>();

    @AfterEach
    void closeAndUnlock() throws Exception {
        LockServiceFactory.getInstance().resetAll();
        for (Database database : databases) {
            unlockEverySessionLockOf(((JdbcConnection) database.getConnection()).getUnderlyingConnection());
            database.close();
        }
        for (Connection session : sessions) {
            unlockEverySessionLockOf(session);
            session.close();
        }
        jdbc.sql("update databasechangeloglock set locked = false, lockgranted = null, lockedby = null").update();
    }

    @Test
    @DisplayName("Given a PostgreSQL database, when Liquibase asks for its lock service, then it gets the one that guards a migration with a session lock")
    void should_get_the_migration_lock_service_when_liquibase_asks_given_postgresql() throws Exception {
        assertThat(lockServiceOf(liquibaseDatabase())).isInstanceOf(MigrationLockService.class);
    }

    @Test
    @DisplayName("Given a changelog lock left by a migration that no longer runs, when the backend waits for the lock, then it takes it at once and gives it back afterwards")
    void should_take_the_lock_at_once_when_waiting_given_a_changelog_lock_left_by_a_gone_migration() throws Exception {
        leaveChangelogLockedBy(GONE_MIGRATION);
        LockService lockService = impatient(lockServiceOf(liquibaseDatabase()));

        lockService.waitForLock();

        assertThat(lockService.hasChangeLogLock()).isTrue();
        assertThat(lockedBy()).isNotEqualTo(GONE_MIGRATION);
        lockService.releaseLock();
        assertThat(changelogLocked()).isFalse();
    }

    @Test
    @DisplayName("Given another backend that migrates and holds the changelog lock, when this backend waits for the lock, then it gives up without touching the other's lock")
    void should_give_up_and_leave_the_lock_when_waiting_given_another_backend_that_migrates() throws Exception {
        LockService other = lockServiceOf(liquibaseDatabase());
        other.waitForLock();
        String otherHolder = lockedBy();
        LockService lockService = impatient(lockServiceOf(liquibaseDatabase()));

        assertThatThrownBy(lockService::waitForLock).isInstanceOf(LockException.class);

        assertThat(changelogLocked()).isTrue();
        assertThat(lockedBy()).isEqualTo(otherHolder);
        other.releaseLock();
    }

    @Test
    @DisplayName("Given a backend holding the session lock of a migration whose changelog lock row is not set yet, when another backend waits, then it does not take the changelog lock")
    void should_not_take_the_lock_when_waiting_given_a_session_that_holds_the_migration_lock() throws Exception {
        Connection migrating = session();
        try (var statement = migrating.createStatement()) {
            statement.execute(AdvisoryLock.SCHEMA_MIGRATION.sessionLockAttempt());
        }
        LockService lockService = impatient(lockServiceOf(liquibaseDatabase()));

        assertThatThrownBy(lockService::waitForLock).isInstanceOf(LockException.class);

        assertThat(changelogLocked()).isFalse();
    }

    @Test
    @DisplayName("Given one backend that migrates, when a second backend waits on another connection, then the second takes the lock only once the first gives it back")
    void should_let_the_second_backend_in_only_after_the_first_releases_when_both_wait_given_one_that_migrates() throws Exception {
        LockService first = lockServiceOf(liquibaseDatabase());
        first.waitForLock();
        LockService second = lockServiceOf(liquibaseDatabase());
        second.setChangeLogLockWaitTime(1);
        second.setChangeLogLockRecheckTime(0);
        CountDownLatch secondStarted = new CountDownLatch(1);

        CompletableFuture<Boolean> secondTook = CompletableFuture.supplyAsync(() -> {
            secondStarted.countDown();
            try {
                second.waitForLock();
                return second.hasChangeLogLock();
            } catch (LockException e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(secondTook).isNotDone();
        first.releaseLock();

        assertThat(secondTook.get(30, TimeUnit.SECONDS)).isTrue();
        second.releaseLock();
        assertThat(changelogLocked()).isFalse();
    }

    @Test
    @DisplayName("Given a backend that took and released the lock, when another session asks for the migration's session lock, then it is free")
    void should_free_the_session_lock_when_released_given_a_backend_that_took_the_lock() throws Exception {
        LockService lockService = lockServiceOf(liquibaseDatabase());
        lockService.waitForLock();

        lockService.releaseLock();

        try (var statement = session().createStatement();
             var result = statement.executeQuery(AdvisoryLock.SCHEMA_MIGRATION.sessionLockAttempt())) {
            result.next();
            assertThat(result.getBoolean(1)).isTrue();
        }
    }

    private static void unlockEverySessionLockOf(Connection connection) throws Exception {
        if (!connection.getAutoCommit()) {
            connection.rollback();
        }
        try (var statement = connection.createStatement()) {
            statement.execute("select pg_advisory_unlock_all()");
        }
    }

    @Test
    @DisplayName("Given the connection Liquibase migrates on, when the backend takes the changelog lock on it, then that very session holds the migration's session lock under its own lock timeout and a pooled session cannot take it")
    void should_hold_the_session_lock_on_the_migration_session_when_the_lock_is_taken_given_the_migrations_connection() throws Exception {
        Database migrating = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(migrationDataSource.getConnection()));
        databases.add(migrating);
        Connection migrationSession = ((JdbcConnection) migrating.getConnection()).getUnderlyingConnection();

        lockServiceOf(migrating).waitForLock();

        try (var statement = migrationSession.createStatement();
             var result = statement.executeQuery("select current_setting('lock_timeout'), count(*) from pg_locks "
                     + "where locktype = 'advisory' and pid = pg_backend_pid() and granted and objid = " + AdvisoryLock.SCHEMA_MIGRATION.key())) {
            result.next();
            assertThat(result.getString(1)).isEqualTo("2min");
            assertThat(result.getLong(2)).isEqualTo(1);
        }
        try (var statement = session().createStatement();
             var result = statement.executeQuery(AdvisoryLock.SCHEMA_MIGRATION.sessionLockAttempt())) {
            result.next();
            assertThat(result.getBoolean(1)).isFalse();
        }
        lockServiceOf(migrating).releaseLock();
    }

    private Database liquibaseDatabase() throws Exception {
        Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(dataSource.getConnection()));
        databases.add(database);
        return database;
    }

    private Connection session() throws Exception {
        Connection connection = dataSource.getConnection();
        sessions.add(connection);
        return connection;
    }

    private static LockService lockServiceOf(Database database) {
        return LockServiceFactory.getInstance().getLockService(database);
    }

    private static LockService impatient(LockService lockService) {
        lockService.setChangeLogLockWaitTime(0);
        lockService.setChangeLogLockRecheckTime(0);
        return lockService;
    }

    private void leaveChangelogLockedBy(String holder) {
        jdbc.sql("update databasechangeloglock set locked = true, lockgranted = now() - interval '1 hour', lockedby = :holder")
                .param("holder", holder)
                .update();
    }

    private boolean changelogLocked() {
        return jdbc.sql("select locked from databasechangeloglock").query(Boolean.class).single();
    }

    private String lockedBy() {
        return jdbc.sql("select coalesce(lockedby, '') from databasechangeloglock").query(String.class).single();
    }
}
