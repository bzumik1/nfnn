package cz.novanadeje.app.shared.infrastructure.lock;

import liquibase.Scope;
import liquibase.database.Database;
import liquibase.database.core.PostgresDatabase;
import liquibase.exception.DatabaseException;
import liquibase.exception.LockException;
import liquibase.executor.ExecutorService;
import liquibase.lockservice.StandardLockService;
import liquibase.statement.core.RawParameterizedSqlStatement;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MigrationLockService extends StandardLockService {

    private static final Logger log = LoggerFactory.getLogger(MigrationLockService.class);

    private boolean holdsSessionLock;

    @Override
    public int getPriority() {
        return PRIORITY_DATABASE;
    }

    @Override
    public boolean supports(Database database) {
        return database instanceof PostgresDatabase;
    }

    @Override
    public boolean acquireLock() throws LockException {
        if (hasChangeLogLock()) {
            return true;
        }
        try {
            if (!holdsSessionLock) {
                if (!sessionLockTaken("select pg_try_advisory_lock(?)")) {
                    return false;
                }
                holdsSessionLock = true;
                releaseLockOfGoneMigration();
            }
            return super.acquireLock();
        } catch (DatabaseException e) {
            throw new LockException(e);
        } finally {
            if (!hasChangeLogLock()) {
                releaseSessionLockOfAFailedAttempt();
            }
        }
    }

    @Override
    public void releaseLock() throws LockException {
        try {
            super.releaseLock();
        } finally {
            try {
                releaseSessionLock();
            } catch (DatabaseException e) {
                throw new LockException(e);
            }
        }
    }

    @Override
    public void reset() {
        super.reset();
        holdsSessionLock = false;
    }

    private void releaseLockOfGoneMigration() throws DatabaseException, LockException {
        init();
        if (listLocks().length > 0) {
            super.releaseLock();
            log.warn("Released a database changelog lock left by a migration that no longer runs");
        }
    }

    private void releaseSessionLockOfAFailedAttempt() throws LockException {
        try {
            releaseSessionLock();
        } catch (DatabaseException e) {
            throw new LockException(e);
        }
    }

    private void releaseSessionLock() throws DatabaseException {
        if (holdsSessionLock) {
            holdsSessionLock = false;
            sessionLockTaken("select pg_advisory_unlock(?)");
            database.rollback();
        }
    }

    private boolean sessionLockTaken(String query) throws DatabaseException {
        return Boolean.TRUE.equals(Scope.getCurrentScope().getSingleton(ExecutorService.class).getExecutor("jdbc", database)
                .queryForObject(new RawParameterizedSqlStatement(query, AdvisoryLock.SCHEMA_MIGRATION.key()), Boolean.class));
    }
}
