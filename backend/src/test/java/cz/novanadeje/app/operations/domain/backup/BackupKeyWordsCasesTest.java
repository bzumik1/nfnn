package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupKeyWordsCasesTest {

    static final String WORDLIST_SHA256 = "7e80e161c3e93d9554c2efb78d4e3cebf8fc727e9c52e03b83b94406bdcc95fc";
    private static final Path CASES = Path.of("..", "test-cases", "backup-key-words.json");
    private static final JsonNode SHARED = read();

    @Test
    @DisplayName("Given the Czech wordlist of BIP39, when it is loaded, then it is the published list the shared cases were made with")
    void should_be_published_list_when_loaded() throws IOException, NoSuchAlgorithmException {
        try (InputStream list = BackupKeyWords.class.getResourceAsStream("bip39-czech.txt")) {
            assertThat(list).isNotNull();
            String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(list.readAllBytes()));

            assertThat(sha256).isEqualTo(WORDLIST_SHA256).isEqualTo(SHARED.get("wordlistSha256").asString());
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("keys")
    @DisplayName("Given a key of the shared cases, when it is written as words, then it gives the 24 words of the case")
    void should_give_case_words_when_written_as_words(String key, List<String> words) {
        assertThat(new BackupKey(key).words()).containsExactlyElementsOf(words);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("keys")
    @DisplayName("Given the 24 words of a shared case, when they are read as a key, then they give the key of the case")
    void should_give_case_key_when_words_read(String key, List<String> words) {
        assertThat(BackupKey.parse(String.join(" ", words))).isEqualTo(new BackupKey(key));
    }

    @ParameterizedTest(name = "\"{0}\"")
    @MethodSource("typedWords")
    @DisplayName("Given a word typed as in the shared cases, when it is read, then it is the word of the case or none")
    void should_give_case_word_when_typed_word_read(String typed, Optional<String> word) {
        assertThat(BackupKeyWords.canonical(typed)).isEqualTo(word);
    }

    @ParameterizedTest(name = "\"{0}\"")
    @MethodSource("parsed")
    @DisplayName("Given a key or words pasted as in the shared cases, when they are read, then they give the key of the case or are refused")
    void should_give_case_key_or_refuse_when_pasted_text_read(String input, Optional<String> key) {
        if (key.isPresent()) {
            assertThat(BackupKey.parse(input)).isEqualTo(new BackupKey(key.get()));
        } else {
            assertThatThrownBy(() -> BackupKey.parse(input)).isInstanceOf(InvalidBackupKey.class);
        }
    }

    static Stream<Arguments> keys() {
        return SHARED.get("keys").valueStream()
                .map(entry -> Arguments.of(entry.get("key").asString(),
                        entry.get("words").valueStream().map(JsonNode::asString).toList()));
    }

    static Stream<Arguments> typedWords() {
        return SHARED.get("typedWords").valueStream()
                .map(entry -> Arguments.of(entry.get("typed").asString(), optional(entry.get("word"))));
    }

    static Stream<Arguments> parsed() {
        return SHARED.get("parse").valueStream()
                .map(entry -> Arguments.of(entry.get("input").asString(), optional(entry.get("key"))));
    }

    private static Optional<String> optional(JsonNode value) {
        return value.isNull() ? Optional.empty() : Optional.of(value.asString());
    }

    private static JsonNode read() {
        try {
            return JsonMapper.builder().build().readTree(Files.readString(CASES));
        } catch (IOException missing) {
            throw new IllegalStateException("The shared cases are read from the repository root: " + CASES.toAbsolutePath(), missing);
        }
    }
}
