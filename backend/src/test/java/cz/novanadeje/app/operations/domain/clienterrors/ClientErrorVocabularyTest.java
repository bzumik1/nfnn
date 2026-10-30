package cz.novanadeje.app.operations.domain.clienterrors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class ClientErrorVocabularyTest {

    private static final String SAFE_WORD = "[A-Za-z][A-Za-z-]*";
    private static final Path VOCABULARY = Path.of("..", "frontend", "src", "app", "core", "errors", "error-vocabulary.json");

    static Stream<Arguments> lists() {
        return Stream.of(
                Arguments.of("kinds", ClientErrorKind.values()),
                Arguments.of("places", ClientErrorPlace.values()),
                Arguments.of("names", ClientErrorName.values()),
                Arguments.of("browsers", ClientBrowser.values()),
                Arguments.of("operatingSystems", ClientOperatingSystem.values()),
                Arguments.of("displayModes", ClientDisplayMode.values()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("lists")
    @DisplayName("Given the vocabulary the frontend exports from its code, when a list is read, then the backend accepts exactly its values in its order")
    void should_accept_exactly_the_frontend_values_when_a_list_is_read_given_the_exported_vocabulary(String list, ClientErrorTerm[] terms) {
        JsonNode exported = JsonMapper.builder().build().readTree(VOCABULARY.toFile()).get(list);

        assertThat(exported).withFailMessage("%s lists no %s", VOCABULARY, list).isNotNull();
        assertThat(Arrays.stream(terms).map(ClientErrorTerm::wire).toList())
                .isEqualTo(exported.valueStream().map(JsonNode::asString).toList());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("lists")
    @DisplayName("Given a list of the vocabulary, when each of its values is parsed back, then it names its own term and nothing else parses")
    void should_parse_every_value_back_when_parsed_given_a_list(String list, ClientErrorTerm[] terms) {
        for (ClientErrorTerm term : terms) {
            assertThat(ClientErrorTerm.parse(List.of(terms), term.wire())).contains(term);
        }
        assertThat(ClientErrorTerm.parse(List.of(terms), "unknown value")).isEmpty();
        assertThat(ClientErrorTerm.parse(List.of(terms), null)).isEmpty();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("lists")
    @DisplayName("Given a list the backend logs from, when its values are read, then each is a safe word of letters and hyphens that cannot break or forge a log line")
    void should_hold_only_safe_words_when_read_given_a_logged_list(String list, ClientErrorTerm[] terms) {
        assertThat(Arrays.stream(terms).map(ClientErrorTerm::wire)).allMatch(value -> value.matches(SAFE_WORD));
        assertThat(ClientErrorBucket.values()).extracting(ClientErrorBucket::wire).allMatch(value -> value.matches(SAFE_WORD));
    }
}
