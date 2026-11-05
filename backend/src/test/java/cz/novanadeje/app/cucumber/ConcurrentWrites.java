package cz.novanadeje.app.cucumber;

import io.cucumber.spring.ScenarioScope;
import org.awaitility.Awaitility;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

@Component
@ScenarioScope
public class ConcurrentWrites {

    private static final Duration WAITING_AT_THE_LOCK = Duration.ofSeconds(10);

    private final ApiClient api;
    private final DataSource dataSource;
    private final JdbcClient jdbc;
    private final List<Write> writes = new ArrayList<>();
    private final List<ResponseEntity<String>> answers = new ArrayList<>();

    public ConcurrentWrites(ApiClient api, DataSource dataSource, JdbcClient jdbc) {
        this.api = api;
        this.dataSource = dataSource;
        this.jdbc = jdbc;
    }

    public record Write(ApiClient.PreparedRequest request, String versionRead, Supplier<String> versionNow) {
    }

    public void sendWhileHeld(String lockSql, Object lockParameter, List<Write> started) {
        writes.clear();
        answers.clear();
        writes.addAll(started);
        try (Connection holder = dataSource.getConnection()) {
            holder.setAutoCommit(false);
            try {
                try (PreparedStatement lock = holder.prepareStatement(lockSql)) {
                    lock.setObject(1, lockParameter);
                    lock.execute();
                }
                int holderPid = backendPid(holder);
                answers.addAll(api.sendOneAfterAnother(started.stream().map(Write::request).toList(),
                        startedCount -> awaitWaitingBehind(holderPid, startedCount), () -> release(holder)));
            } finally {
                release(holder);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("The lock for the concurrent writes could not be held", e);
        }
    }

    public Write write(int position) {
        return writes.get(position - 1);
    }

    public ResponseEntity<String> answer(int position) {
        return answers.get(position - 1);
    }

    private void awaitWaitingBehind(int holderPid, int count) {
        Awaitility.await("" + count + " request(s) waiting at the held lock").atMost(WAITING_AT_THE_LOCK).until(() -> jdbc
                .sql("""
                        with behind_the_holder as (select pid from pg_stat_activity where ? = any(pg_blocking_pids(pid)))
                        select count(*) from pg_stat_activity
                        where pid in (select pid from behind_the_holder) or pg_blocking_pids(pid) && array(select pid from behind_the_holder)
                        """).param(holderPid).query(Integer.class).single() >= count);
    }

    private static int backendPid(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("select pg_backend_pid()"); ResultSet result = statement.executeQuery()) {
            result.next();
            return result.getInt(1);
        }
    }

    private static void release(Connection holder) {
        try {
            if (!holder.isClosed() && !holder.getAutoCommit()) {
                holder.rollback();
            }
        } catch (SQLException e) {
            throw new IllegalStateException("The held lock could not be released", e);
        }
    }
}
