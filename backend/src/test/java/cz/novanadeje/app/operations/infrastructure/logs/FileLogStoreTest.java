package cz.novanadeje.app.operations.infrastructure.logs;

import cz.novanadeje.app.operations.domain.logs.LogFile;
import cz.novanadeje.app.operations.domain.logs.LogSearchTooSlow;
import cz.novanadeje.app.operations.domain.logs.LogMatch;
import cz.novanadeje.app.operations.domain.logs.LogWindow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileLogStoreTest {

    private static final String LINES = "first line\nsecond line about Fio\nthird line\n";

    @TempDir
    Path folder;

    private FileLogStore store;

    @BeforeEach
    void setUp() throws IOException {
        store = new FileLogStore(new LogProperties(folder));
        Files.writeString(folder.resolve("backend.log"), LINES);
        try (OutputStream out = new GZIPOutputStream(Files.newOutputStream(folder.resolve("backend.log.2026-10-22.0.gz")))) {
            out.write("older first\nolder second\n".getBytes(StandardCharsets.UTF_8));
        }
        Files.writeString(folder.resolve(".hidden"), "x");
        Files.createDirectories(folder.resolve("sub"));
    }

    @Test
    @DisplayName("Given a folder with logs, a hidden file and a folder, when the files are listed, then only the safe-named files come, sorted")
    void should_list_safe_files_when_listed_given_mixed_folder() {
        assertThat(store.isAvailable()).isTrue();
        assertThat(store.files()).extracting(LogFile::name, LogFile::compressed)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("backend.log", false),
                        org.assertj.core.groups.Tuple.tuple("backend.log.2026-10-22.0.gz", true));
        assertThat(store.file("backend.log")).isPresent();
        assertThat(store.file("missing.log")).isEmpty();
        assertThat(store.file("../backend.log")).isEmpty();
    }

    @Test
    @DisplayName("Given a missing folder, when availability is asked, then the store is unavailable")
    void should_be_unavailable_when_asked_given_missing_folder() {
        assertThat(new FileLogStore(new LogProperties(folder.resolve("none"))).isAvailable()).isFalse();
    }

    @Test
    @DisplayName("Given no position, when a log is read, then the window is its end, whole from the start when it fits")
    void should_read_the_end_when_read_given_no_position() {
        LogWindow window = store.read(store.file("backend.log").orElseThrow(), Optional.empty(), 1000);

        assertThat(window.text()).isEqualTo(LINES);
        assertThat(window.from()).isZero();
        assertThat(window.to()).isEqualTo(LINES.length());
        assertThat(window.hasOlder()).isFalse();
        assertThat(window.hasNewer()).isFalse();
    }

    @Test
    @DisplayName("Given a position inside a line, when a window is read, then it starts at the next line and ends at a line end")
    void should_align_to_lines_when_read_given_position_inside_line() {
        LogWindow window = store.read(store.file("backend.log").orElseThrow(), Optional.of(3L), 25);

        assertThat(window.text()).isEqualTo("second line about Fio\n");
        assertThat(window.from()).isEqualTo(LINES.indexOf("second"));
        assertThat(window.to()).isEqualTo(LINES.indexOf("third"));
        assertThat(window.hasOlder()).isTrue();
        assertThat(window.hasNewer()).isTrue();
    }

    @Test
    @DisplayName("Given a small window at the end, when it is read, then only the whole last lines come")
    void should_keep_whole_last_lines_when_read_given_small_window() {
        LogWindow window = store.read(store.file("backend.log").orElseThrow(), Optional.empty(), 15);

        assertThat(window.text()).isEqualTo("third line\n");
        assertThat(window.hasOlder()).isTrue();
    }

    @Test
    @DisplayName("Given a window ending inside a line, when it is read, then the window grows to that line's end")
    void should_finish_the_last_line_when_read_given_window_ending_inside_line() {
        LogWindow window = store.read(store.file("backend.log").orElseThrow(), Optional.of(0L), 5);

        assertThat(window.text()).isEqualTo("first line\n");
        assertThat(window.to()).isEqualTo(LINES.indexOf("second"));
        assertThat(window.hasNewer()).isTrue();
    }

    @Test
    @DisplayName("Given a rotated .gz copy, when it is read, then it is unpacked and its size is the unpacked one")
    void should_unpack_when_read_given_compressed_copy() {
        LogWindow window = store.read(store.file("backend.log.2026-10-22.0.gz").orElseThrow(), Optional.of(12L), 100);

        assertThat(window.sizeBytes()).isEqualTo("older first\nolder second\n".length());
        assertThat(window.text()).isEqualTo("older second\n");
        assertThat(window.from()).isEqualTo(12);
    }

    @Test
    @DisplayName("Given a pattern, when a log is searched, then the newest matches come first with their positions, at most the limit")
    void should_find_newest_first_when_searched_given_pattern() {
        LogFile file = store.file("backend.log").orElseThrow();

        List<LogMatch> all = store.search(file, Pattern.compile("line"), 10, Optional.empty());
        List<LogMatch> limited = store.search(file, Pattern.compile("line"), 2, Optional.empty());
        List<LogMatch> older = store.search(file, Pattern.compile("line"), 10, Optional.of((long) LINES.indexOf("third")));
        List<LogMatch> compressed = store.search(store.file("backend.log.2026-10-22.0.gz").orElseThrow(), Pattern.compile("SECOND", Pattern.CASE_INSENSITIVE), 10,
                Optional.empty());

        assertThat(all).extracting(LogMatch::line).containsExactly("third line", "second line about Fio", "first line");
        assertThat(all).extracting(LogMatch::offset).containsExactly((long) LINES.indexOf("third"), (long) LINES.indexOf("second"), 0L);
        assertThat(limited).extracting(LogMatch::line).containsExactly("third line", "second line about Fio");
        assertThat(older).extracting(LogMatch::line).containsExactly("second line about Fio", "first line");
        assertThat(compressed).extracting(LogMatch::line).containsExactly("older second");
    }

    @Test
    @DisplayName("Given a link in the log folder that points outside it, when the files are listed or read, then the link is neither listed, found nor searched")
    void should_ignore_link_when_listed_or_read_given_symlink_to_outside() throws IOException {
        Path outside = Files.writeString(folder.resolve("sub").resolve("secret"), "JWT_SECRET=very-secret\n");
        Files.createSymbolicLink(folder.resolve("planted.log"), outside);
        LogFile planted = new LogFile("planted.log", 0, java.time.Instant.EPOCH, false);

        assertThat(store.files()).extracting(LogFile::name).doesNotContain("planted.log");
        assertThat(store.file("planted.log")).isEmpty();
        assertThatThrownBy(() -> store.search(planted, Pattern.compile("."), 10, Optional.empty())).isInstanceOf(java.io.UncheckedIOException.class);
        assertThatThrownBy(() -> store.read(planted, Optional.of(0L), 100)).isInstanceOf(java.io.UncheckedIOException.class);
    }

    @Test
    @DisplayName("Given a pattern that backtracks for minutes, when the log is searched, then the search stops within its time and says so")
    void should_stop_when_searched_given_catastrophic_pattern() throws IOException {
        Files.writeString(folder.resolve("long.log"), "a,".repeat(40) + "\n");
        FileLogStore quick = new FileLogStore(folder, Duration.ofMillis(300));
        LogFile file = quick.file("long.log").orElseThrow();
        long started = System.nanoTime();

        assertThatThrownBy(() -> quick.search(file, Pattern.compile("(.*,){12}z"), 10, Optional.empty())).isInstanceOf(LogSearchTooSlow.class);

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(5));
    }
}
