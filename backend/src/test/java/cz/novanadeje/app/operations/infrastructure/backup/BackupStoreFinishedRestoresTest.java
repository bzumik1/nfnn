package cz.novanadeje.app.operations.infrastructure.backup;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.backup.BackupStore;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import cz.novanadeje.app.shared.application.restore.FinishedRestore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BackupStoreFinishedRestoresTest {

    private static final Instant STARTED = Instant.parse("2026-11-13T10:00:00Z");
    private static final Instant FINISHED = Instant.parse("2026-11-13T10:02:41Z");
    private static final String REQUEST = "019a1b2c-0000-7000-8000-000000000001";

    private final BackupStore store = mock(BackupStore.class);
    private final BackupStoreFinishedRestores restores = new BackupStoreFinishedRestores(store);

    @Test
    @DisplayName("Given the backup container's status of a successful restore asked for in the administration, when the last restore is read, then it is named by its request and its end")
    void should_name_the_request_when_read_given_a_successful_requested_restore() {
        when(store.lastRestore()).thenReturn(Optional.of(run(RunOutcome.OK, Optional.of(REQUEST))));

        assertThat(restores.lastSucceeded()).contains(new FinishedRestore(REQUEST, FINISHED));
    }

    @Test
    @DisplayName("Given the status of a successful restore of a dump left in the restore folder by hand, when the last restore is read, then it is named by the time it finished")
    void should_name_the_finish_when_read_given_a_successful_restore_without_a_request() {
        when(store.lastRestore()).thenReturn(Optional.of(run(RunOutcome.OK, Optional.empty())));

        assertThat(restores.lastSucceeded()).contains(new FinishedRestore("2026-11-13T10:02:41Z", FINISHED));
    }

    @Test
    @DisplayName("Given a failed restore or none, when the last restore is read, then there is none")
    void should_give_none_when_read_given_a_failed_restore_or_none() {
        when(store.lastRestore()).thenReturn(Optional.of(run(RunOutcome.FAILED, Optional.of(REQUEST))));
        assertThat(restores.lastSucceeded()).isEmpty();

        when(store.lastRestore()).thenReturn(Optional.empty());
        assertThat(restores.lastSucceeded()).isEmpty();
    }

    @Test
    @DisplayName("Given a successful restore whose request id has 40 characters, when the last restore is read, then it is named by that request")
    void should_name_the_request_when_read_given_a_request_id_of_40_characters() {
        String request = "r".repeat(FinishedRestore.MAX_ID_LENGTH);
        when(store.lastRestore()).thenReturn(Optional.of(run(RunOutcome.OK, Optional.of(request))));

        assertThat(restores.lastSucceeded()).contains(new FinishedRestore(request, FINISHED));
    }

    @Test
    @DisplayName("Given a successful restore whose request id is longer than 40 characters, when the last restore is read, then there is none and a WARN gives only the length")
    void should_give_none_and_warn_when_read_given_a_request_id_over_40_characters() {
        String request = "019a1b2c-0000-7000-8000-000000000001-and-more";
        when(store.lastRestore()).thenReturn(Optional.of(run(RunOutcome.OK, Optional.of(request))));
        Logger logger = (Logger) LoggerFactory.getLogger(BackupStoreFinishedRestores.class);
        ListAppender<ILoggingEvent> lines = new ListAppender<>();
        lines.start();
        logger.addAppender(lines);
        try {
            assertThat(restores.lastSucceeded()).isEmpty();
        } finally {
            logger.detachAppender(lines);
        }

        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The last restore names a request id of 45 characters, more than 40, so it confirms no receipt signing key");
        });
    }

    private static BackupRun run(RunOutcome outcome, Optional<String> request) {
        return new BackupRun(outcome, STARTED, FINISHED, Optional.of("nfnn-2026-11-12_0300.dump.age"), Optional.of(1000L), Optional.of(37), request,
                Optional.of(UUID.fromString("019a1c00-0000-7000-8000-00000000a001")), Optional.empty());
    }
}
