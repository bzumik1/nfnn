package cz.novanadeje.app.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.MalformedInputException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class AdvisoryLockRulesTest {

    private static final String ADVISORY_LOCK_FUNCTIONS = "pg_advisory";
    private static final Path REGISTRY = Path.of("cz", "novanadeje", "app", "shared", "infrastructure", "lock", "AdvisoryLock.java");

    @Test
    @DisplayName("Given the main sources and resources, when they are searched for advisory lock calls, then only the registry of advisory locks makes one")
    void should_take_advisory_locks_only_in_the_registry_when_searched_given_the_main_sources() throws IOException {
        Path main = Path.of("src", "main");

        assertThat(filesCallingAdvisoryLocks(main)).containsExactly(main.resolve("java").resolve(REGISTRY));
    }

    @Test
    @DisplayName("Given a planted adapter that takes an advisory lock with its own key, when the sources are searched, then it is reported")
    void should_report_planted_lock_when_searched_given_an_adapter_with_its_own_key(@TempDir Path sources) throws IOException {
        Files.writeString(sources.resolve("PlantedLock.java"), "class PlantedLock { String sql = \"select 1 from pg_advisory_xact_lock(20261106)\"; }");
        Files.writeString(sources.resolve("Unrelated.java"), "class Unrelated { String sql = \"select 1\"; }");

        assertThat(filesCallingAdvisoryLocks(sources)).containsExactly(sources.resolve("PlantedLock.java"));
    }

    private static List<Path> filesCallingAdvisoryLocks(Path root) throws IOException {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(AdvisoryLockRulesTest::callsAnAdvisoryLock).sorted().toList();
        }
    }

    private static boolean callsAnAdvisoryLock(Path file) {
        try {
            return Files.readString(file).toLowerCase(Locale.ROOT).contains(ADVISORY_LOCK_FUNCTIONS);
        } catch (MalformedInputException binary) {
            return false;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
