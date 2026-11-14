package cz.novanadeje.app.operations.infrastructure.backup;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
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

class RestoreFolderReceiptSeedRequestsTest {

    @TempDir
    private Path folders;

    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();
    private Path restore;
    private RestoreFolderReceiptSeedRequests requests;

    @BeforeEach
    void folderAndLog() throws IOException {
        restore = Files.createDirectory(folders.resolve("restore"));
        requests = new RestoreFolderReceiptSeedRequests(new BackupProperties(folders.resolve("backups"), restore, "-", Duration.ofHours(26),
                Duration.ofDays(8), DataSize.ofMegabytes(1)));
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given a restore folder, when a new seed is requested for a key, then the request the entrypoint reads names the key, no part file is left and the request counts as left")
    void should_leave_the_request_naming_the_key_when_requested_given_a_restore_folder() {
        boolean left = requests.requestNewSeedFor("21fe31df");

        assertThat(left).isTrue();
        assertThat(restore.resolve("receipt-signing-key.renew")).hasContent("21fe31df");
        assertThat(restore).isDirectoryNotContaining("glob:**.part");
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given an older request in the restore folder, when a new seed is requested for another key, then the request names the new key")
    void should_replace_the_older_request_when_requested_given_an_older_request() throws IOException {
        Files.writeString(restore.resolve("receipt-signing-key.renew"), "39f713d0");

        assertThat(requests.requestNewSeedFor("21fe31df")).isTrue();

        assertThat(restore.resolve("receipt-signing-key.renew")).hasContent("21fe31df");
    }

    @Test
    @DisplayName("Given no restore folder, when a new seed is requested, then the request does not count as left and an ERROR names the key, the exception class and that the server signs nothing until the seed is replaced")
    void should_not_count_as_left_and_log_error_when_requested_given_no_restore_folder() throws IOException {
        Files.delete(restore);

        boolean left = requests.requestNewSeedFor("21fe31df");

        assertThat(left).isFalse();
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage()).isEqualTo("The request for a new receipt signing seed after the withdrawal of key 21fe31df"
                    + " could not be written (NoSuchFileException); the server signs no receipt until secrets/receipt-signing-key is replaced");
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(RestoreFolderReceiptSeedRequests.class);
    }
}
