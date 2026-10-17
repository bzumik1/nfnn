package cz.novanadeje.fio;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class FioTokenTest {

    private static final String SECRET = "aGEMtmwcsWAjPzhg3bPH3j7Iu15g56d66AdEbfIjqIgMR9Idh6u3";

    @Test
    void should_hide_value_when_printed_given_token() {
        assertThat(FioToken.of(SECRET).toString())
                .doesNotContain(SECRET)
                .isEqualTo("FioToken[***]");
    }

    @Test
    void should_strip_surrounding_whitespace_when_created_given_value_read_from_file() {
        assertThat(FioToken.of("  " + SECRET + "\n")).isEqualTo(FioToken.of(SECRET));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\n"})
    void should_reject_when_created_given_no_value(String value) {
        assertThatIllegalArgumentException().isThrownBy(() -> FioToken.of(value));
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc/def", "abc def", "abc?x=1", "abc%2F", "ab.cd"})
    void should_reject_without_echoing_value_when_created_given_characters_unsafe_in_url_path(String value) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> FioToken.of(value))
                .withMessageNotContaining(value);
    }

    @Test
    void should_replace_every_occurrence_when_masking_given_text_with_token() {
        FioToken token = FioToken.of(SECRET);

        assertThat(token.mask("GET /last/" + SECRET + "/transactions.json and " + SECRET))
                .isEqualTo("GET /last/***/transactions.json and ***");
    }

    @Test
    void should_tell_whether_text_holds_value_when_asked_given_token() {
        FioToken token = FioToken.of(SECRET);

        assertThat(token.occursIn("x" + SECRET + "y")).isTrue();
        assertThat(token.occursIn("nothing here")).isFalse();
        assertThat(token.occursIn(null)).isFalse();
    }
}
