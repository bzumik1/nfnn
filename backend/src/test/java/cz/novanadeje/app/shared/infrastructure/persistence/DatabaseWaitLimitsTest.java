package cz.novanadeje.app.shared.infrastructure.persistence;

import com.zaxxer.hikari.HikariDataSource;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.liquibase.autoconfigure.LiquibaseDataSource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@IntegrationTest
class DatabaseWaitLimitsTest {

    private static final String WAITING_ADDRESS = "cekajici.adresa@example.cz";

    @Autowired
    private DataSource dataSource;
    @Autowired
    @LiquibaseDataSource
    private DataSource migrationDataSource;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void emptyDatabase() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given the application's connection pool, when a connection's session is read, then a lock wait, a statement and an idle transaction are each bounded")
    void should_bound_lock_wait_statement_and_idle_transaction_when_session_read_given_application_pool() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            assertThat(setting(connection, "lock_timeout")).isEqualTo("10s");
            assertThat(setting(connection, "statement_timeout")).isEqualTo("30s");
            assertThat(setting(connection, "idle_in_transaction_session_timeout")).isEqualTo("2min");
        }
    }

    @Test
    @DisplayName("Given the application's connection pool, when its settings are read, then its size, its wait for a connection, a connection's lifetime and the report of a connection held too long are set")
    void should_size_and_bound_pool_when_settings_read_given_application_pool() throws SQLException {
        HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);

        assertThat(pool.getMaximumPoolSize()).isEqualTo(20);
        assertThat(pool.getMinimumIdle()).isEqualTo(5);
        assertThat(pool.getConnectionTimeout()).isEqualTo(Duration.ofSeconds(10).toMillis());
        assertThat(pool.getMaxLifetime()).isEqualTo(Duration.ofMinutes(30).toMillis());
        assertThat(pool.getLeakDetectionThreshold()).isEqualTo(Duration.ofSeconds(60).toMillis());
    }

    @Test
    @DisplayName("Given the migrations' connection, when its session is read, then a lock wait is bounded and a statement is not")
    void should_bound_lock_wait_but_no_statement_when_session_read_given_migration_connection() throws SQLException {
        try (Connection connection = migrationDataSource.getConnection()) {
            assertThat(setting(connection, "lock_timeout")).isEqualTo("2min");
            assertThat(setting(connection, "statement_timeout")).isEqualTo("0");
        }
        assertThat(jdbc.sql("select count(*) from databasechangelog").query(Long.class).single()).isPositive();
    }

    @Test
    @DisplayName("Given the migrations' connection, when a row breaks a unique constraint, then the failure names the constraint and not the row's value")
    void should_keep_value_out_of_failure_when_unique_constraint_broken_given_migration_connection() throws SQLException {
        try (Connection connection = migrationDataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("create temporary table migration_probe (value text constraint uq_migration_probe unique)");
            statement.execute("insert into migration_probe values ('kanarek-migrace')");

            assertThatThrownBy(() -> statement.execute("insert into migration_probe values ('kanarek-migrace')"))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("uq_migration_probe")
                    .hasMessageNotContaining("kanarek-migrace");
        }
    }

    @Test
    @DisplayName("Given another session holding the lock of an e-mail address, when that address registers, then the wait ends after the lock limit with a 503 problem to retry and nothing is stored")
    void should_answer_503_to_retry_after_lock_limit_when_registered_given_address_lock_held_elsewhere() throws Exception {
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService holder = Executors.newSingleThreadExecutor();
        try {
            Future<?> holding = holder.submit(() -> holdAddressLock(held, release));
            assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();

            long started = System.nanoTime();
            MvcResult result = mockMvc.perform(post("/api/donors/auth/register").contentType(MediaType.APPLICATION_JSON)
                            .header("Accept-Language", "cs")
                            .header("X-Forwarded-For", "198.51.100.91")
                            .content("""
                                    {"type":"PERSON","name":"Eva Malá","address":{"street":"Krátká 3","city":"Most","postalCode":"434 01"},
                                     "email":"%s","preferredLocale":"cs"}
                                    """.formatted(WAITING_ADDRESS)))
                    .andReturn();
            Duration waited = Duration.ofNanos(System.nanoTime() - started);
            release.countDown();
            holding.get(30, TimeUnit.SECONDS);

            assertThat(waited).isBetween(Duration.ofSeconds(9), Duration.ofSeconds(20));
            assertThat(result.getResponse().getStatus()).isEqualTo(503);
            assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
            assertThat(result.getResponse().getHeader("Retry-After")).isEqualTo("5");
            assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                    .contains("\"type\":\"https://nfnn.cz/problems/server-busy\"")
                    .contains("\"title\":\"Server je právě vytížený\"");
            assertThat(jdbc.sql("select count(*) from donor where email = ?").param(WAITING_ADDRESS).query(Long.class).single()).isZero();
        } finally {
            release.countDown();
            holder.shutdownNow();
        }
    }

    private Void holdAddressLock(CountDownLatch held, CountDownLatch release) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.execute("select pg_advisory_xact_lock(" + Math.toIntExact(AdvisoryLock.DONOR_EMAIL_ADDRESSES.key()) + ", "
                        + WAITING_ADDRESS.hashCode() + ")");
            }
            held.countDown();
            release.await(30, TimeUnit.SECONDS);
            connection.rollback();
        }
        return null;
    }

    private static String setting(Connection connection, String name) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery("show " + name)) {
            result.next();
            return result.getString(1);
        }
    }
}
