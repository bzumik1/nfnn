package cz.novanadeje.app.operations.application.loggers;

import ch.qos.logback.classic.Logger;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.LoggerName;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.RefusedCommits;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

@IntegrationTest
class LogLevelAuditCommitTest {

    private static final LoggerName CANARY = new LoggerName("cz.novanadeje.app.operations.auditcanary");

    @Autowired
    private LogLevelService logLevels;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;

    private final UUID adminId = UUID.randomUUID();

    @BeforeEach
    void startClean() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @AfterEach
    void putTheCanaryBack() {
        logLevels.reset(adminId, CANARY);
        canary().setLevel(null);
    }

    @Test
    @DisplayName("Given a raise whose commit is refused after the audit listener ran, when an administrator raises a logger, then the logger keeps its level, no override shows or can be reset and nothing is audited")
    void should_leave_the_logger_as_it_was_when_raised_given_the_audit_refused_at_the_commit() {
        assertThatIllegalStateException().isThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            logLevels.override(adminId, CANARY, LogLevel.DEBUG, 5);
            RefusedCommits.refuseTheCommitAfterEverythingRegisteredSoFar();
        }));

        assertThat(canary().getLevel()).isNull();
        assertThat(logLevels.view().loggers()).noneMatch(logger -> logger.logger().equals(CANARY.value()));
        assertThat(auditedChanges()).isZero();
        assertThat(logLevels.reset(adminId, CANARY)).isFalse();
    }

    @Test
    @DisplayName("Given a raise whose audit commits, when an administrator raises a logger, then the logger is raised, its override shows and the change is audited")
    void should_raise_the_logger_when_raised_given_the_audit_committed() {
        logLevels.override(adminId, CANARY, LogLevel.DEBUG, 5);

        assertThat(canary().getLevel()).hasToString("DEBUG");
        assertThat(logLevels.view().loggers()).anySatisfy(logger -> assertThat(logger.logger()).isEqualTo(CANARY.value()));
        assertThat(auditedChanges()).isEqualTo(1);
    }

    private long auditedChanges() {
        return jdbc.sql("select count(*) from admin_action where action = 'CHANGE_LOG_LEVEL'").query(Long.class).single();
    }

    private static Logger canary() {
        return (Logger) LoggerFactory.getLogger(CANARY.value());
    }
}
