package cz.novanadeje.app.operations.infrastructure.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupKeyWordListTest {

    private static final Path CASES = Path.of("..", "test-cases", "backup-key-words.json");
    private static final String FIRST_WORD = "abdikace";
    private static final String CHANGED_WORD = "abdikaze";
    private static final String SHORT_WORD = "ab";

    @Test
    @DisplayName("Given the Czech wordlist of BIP39, when it is loaded, then it is the published list the shared cases were made with")
    void should_be_published_list_when_loaded() throws IOException {
        String sharedSha256 = JsonMapper.builder().build().readTree(Files.readString(CASES)).get("wordlistSha256").asString();

        assertThat(BackupKeyWordList.SHA256).isEqualTo(sharedSha256);
        assertThat(CzechBackupKeyWords.WORDLIST.canonical(FIRST_WORD)).contains(FIRST_WORD);
    }

    @Test
    @DisplayName("Given a wordlist missing from the classpath, when it is read, then it fails naming the list, so the backend stops at startup")
    void should_fail_naming_the_list_when_read_given_a_missing_list() {
        assertThatThrownBy(() -> BackupKeyWordList.read("missing-words.txt"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("missing-words.txt");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("damagedLists")
    @DisplayName("Given a damaged Czech wordlist, when it is loaded, then it fails naming the list and no word, so the backend stops at startup")
    void should_fail_naming_the_list_when_loaded_given_a_damaged_list(String damage, byte[] list) {
        assertThatThrownBy(() -> BackupKeyWordList.czech(BackupKeyWordList.LIST, list))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(BackupKeyWordList.LIST)
                .hasMessageNotContaining(FIRST_WORD)
                .hasMessageNotContaining(CHANGED_WORD);
    }

    static Stream<Arguments> damagedLists() {
        byte[] published = BackupKeyWordList.read(BackupKeyWordList.LIST);
        String text = new String(published, StandardCharsets.US_ASCII);
        return Stream.of(
                Arguments.of("an empty list", new byte[0]),
                Arguments.of("a truncated list", Arrays.copyOf(published, published.length / 2)),
                Arguments.of("a changed word", text.replaceFirst(FIRST_WORD, CHANGED_WORD).getBytes(StandardCharsets.US_ASCII)),
                Arguments.of("a short word", text.replaceFirst(FIRST_WORD, SHORT_WORD).getBytes(StandardCharsets.US_ASCII)));
    }
}
