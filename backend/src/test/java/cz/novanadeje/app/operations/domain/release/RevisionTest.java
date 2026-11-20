package cz.novanadeje.app.operations.domain.release;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class RevisionTest {

    @ParameterizedTest
    @ValueSource(strings = {"2b79cb3", "dev", "2b79cb3f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f", "v1.2-rc_3"})
    @DisplayName("Given a short commit, a full one, dev or another plain word, when it is parsed, then it is a revision")
    void should_parse_when_read_given_a_plain_word(String text) {
        assertThat(Revision.parse(text)).hasValueSatisfying(revision -> assertThat(revision.value()).isEqualTo(text));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "2b79 cb3", "<script>", "a/b", "2b79cb3f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f0"})
    @DisplayName("Given nothing, a space, markup, a slash or more than 40 characters, when it is parsed, then it is no revision")
    void should_refuse_when_read_given_anything_else(String text) {
        assertThat(Revision.parse(text)).isEmpty();
    }
}
