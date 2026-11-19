package cz.novanadeje.app.operations.infrastructure.backup;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.receiptseed.ReceiptSeedRequestsAtStart;
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

    @Test
    @DisplayName("Given no request and no earlier start that asked, when a new seed is requested at a start, then the request names the key and the start notes that it asked")
    void should_request_and_note_when_requested_at_start_given_nothing_asked_before() {
        assertThat(requests.requestNewSeedAtStartFor("21fe31df")).isEqualTo(ReceiptSeedRequestsAtStart.StartRequest.REQUESTED);

        assertThat(restore.resolve("receipt-signing-key.renew")).hasContent("21fe31df");
        assertThat(restore.resolve("receipt-signing-key.renew-at-start-21fe31df")).exists();
    }

    @Test
    @DisplayName("Given a start that already asked for a new seed for the key, when one is requested at the next start, then nothing is requested again")
    void should_not_request_again_when_requested_at_start_given_an_earlier_start_asked() {
        requests.requestNewSeedAtStartFor("21fe31df");
        requests.requestNewSeedAtStartFor("21fe31df");
        assertThat(restore.resolve("receipt-signing-key.renew")).exists();
        deleteRequest();

        assertThat(requests.requestNewSeedAtStartFor("21fe31df")).isEqualTo(ReceiptSeedRequestsAtStart.StartRequest.TRIED_AT_AN_EARLIER_START);

        assertThat(restore.resolve("receipt-signing-key.renew")).doesNotExist();
    }

    @Test
    @DisplayName("Given a request for the key that still waits, when one is requested at a start, then it already waits and no start is noted")
    void should_answer_waiting_when_requested_at_start_given_a_waiting_request() throws IOException {
        Files.writeString(restore.resolve("receipt-signing-key.renew"), "21fe31df");

        assertThat(requests.requestNewSeedAtStartFor("21fe31df")).isEqualTo(ReceiptSeedRequestsAtStart.StartRequest.ALREADY_WAITING);

        assertThat(restore.resolve("receipt-signing-key.renew-at-start-21fe31df")).doesNotExist();
    }

    @Test
    @DisplayName("Given no restore folder, when a new seed is requested at a start, then it is not written and an ERROR names the key and the exception class")
    void should_not_write_and_log_error_when_requested_at_start_given_no_restore_folder() throws IOException {
        Files.delete(restore);

        assertThat(requests.requestNewSeedAtStartFor("21fe31df")).isEqualTo(ReceiptSeedRequestsAtStart.StartRequest.NOT_WRITTEN);

        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage()).startsWith("Whether a new receipt signing seed was already asked for key 21fe31df could not be read or noted (");
        });
    }

    private void deleteRequest() {
        try {
            Files.delete(restore.resolve("receipt-signing-key.renew"));
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
    }
}
