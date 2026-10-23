package cz.novanadeje.app.operations.infrastructure.diagnostics;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import cz.novanadeje.app.operations.application.diagnostics.DatabaseDiagnosticsSource;
import cz.novanadeje.app.operations.domain.diagnostics.DatabaseDiagnostics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

@Component
class HikariDatabaseDiagnosticsSource implements DatabaseDiagnosticsSource {

    private static final int PING_TIMEOUT_SECONDS = 2;
    private static final Logger log = LoggerFactory.getLogger(HikariDatabaseDiagnosticsSource.class);

    private final DataSource dataSource;

    HikariDatabaseDiagnosticsSource(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public DatabaseDiagnostics database() {
        long started = System.nanoTime();
        boolean reachable = ping();
        long pingMillis = (System.nanoTime() - started) / 1_000_000;
        HikariPoolMXBean pool = pool();
        int maximum = maximumPoolSize();
        if (pool == null) {
            return new DatabaseDiagnostics(reachable, pingMillis, 0, 0, 0, maximum);
        }
        return new DatabaseDiagnostics(reachable, pingMillis, pool.getActiveConnections(), pool.getIdleConnections(),
                pool.getThreadsAwaitingConnection(), maximum);
    }

    private boolean ping() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(PING_TIMEOUT_SECONDS);
        } catch (SQLException e) {
            log.warn("The database ping failed: {}", e.getClass().getSimpleName());
            return false;
        }
    }

    private HikariPoolMXBean pool() {
        try {
            return dataSource.isWrapperFor(HikariDataSource.class) ? dataSource.unwrap(HikariDataSource.class).getHikariPoolMXBean() : null;
        } catch (SQLException e) {
            return null;
        }
    }

    private int maximumPoolSize() {
        try {
            return dataSource.isWrapperFor(HikariDataSource.class) ? dataSource.unwrap(HikariDataSource.class).getMaximumPoolSize() : 0;
        } catch (SQLException e) {
            return 0;
        }
    }
}
