package cz.novanadeje.app.operations.infrastructure.backup;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.settings.ApplicationRestarter;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawalAnnounced;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.util.unit.DataSize;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class ReceiptSeedRenewalTest {

    @TempDir
    private Path folders;

    private final ApplicationRestarter restarter = mock(ApplicationRestarter.class);
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();
    private Path restore;
    private ReceiptSeedRenewal renewal;

    @BeforeEach
    void folderAndLog() throws IOException {
        restore = Files.createDirectory(folders.resolve("restore"));
        renewal = new ReceiptSeedRenewal(new BackupProperties(folders.resolve("backups"), restore, "-", Duration.ofHours(26), Duration.ofDays(8),
                DataSize.ofMegabytes(1)), restarter);
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given the server's own key withdrawn, when the administrators were told, then the request for a new seed names the key in the restore folder, the backend restarts and a WARN says why")
    void should_leave_the_request_and_restart_when_committed_given_the_current_key() throws IOException {
        renewal.renewSeed(new ReceiptSigningKeyWithdrawalAnnounced("21fe31df", true));

        assertThat(restore.resolve("receipt-signing-key.renew")).hasContent("21fe31df");
        assertThat(restore).isDirectoryNotContaining("glob:**.part");
        verify(restarter).restartAfterCommit();
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The receipt signing key 21fe31df of this server was withdrawn, so the backend restarts and its entrypoint generates a new seed");
        });
    }

    @Test
    @DisplayName("Given an earlier key withdrawn, when the administrators were told, then no seed is requested and the backend keeps running")
    void should_leave_nothing_when_committed_given_an_earlier_key() {
        renewal.renewSeed(new ReceiptSigningKeyWithdrawalAnnounced("39f713d0", false));

        assertThat(restore).isEmptyDirectory();
        verify(restarter, never()).restartAfterCommit();
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given no restore folder, when the administrators were told of the withdrawal of the own key, then the backend does not restart and an ERROR says the seed stays until replaced by hand")
    void should_not_restart_and_log_error_when_committed_given_no_restore_folder() throws IOException {
        Files.delete(restore);

        renewal.renewSeed(new ReceiptSigningKeyWithdrawalAnnounced("21fe31df", true));

        verify(restarter, never()).restartAfterCommit();
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage()).isEqualTo("The request for a new receipt signing seed after the withdrawal of key 21fe31df"
                    + " could not be written (NoSuchFileException); the server signs no receipt until secrets/receipt-signing-key is replaced");
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReceiptSeedRenewal.class);
    }
}
