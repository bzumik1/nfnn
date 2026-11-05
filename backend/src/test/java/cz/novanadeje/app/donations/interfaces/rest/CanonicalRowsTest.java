package cz.novanadeje.app.donations.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CanonicalRowsTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    @DisplayName("Given rows with members in any order, when they are written canonically, then members are sorted by UTF-16 code units and nothing is spaced")
    void should_sort_members_by_code_units_without_whitespace_when_rows_are_written_given_members_in_any_order() {
        String written = CanonicalRows.canonical(json.readTree("[ {\"\uFFFF\": 2, \"b\": [true, null, false], \"\uD83D\uDE00\": 1, \"a\": {\"z\": 0, \"y\": -12}} ]"));

        assertThat(written).isEqualTo("[{\"a\":{\"y\":-12,\"z\":0},\"b\":[true,null,false],\"\uD83D\uDE00\":1,\"\uFFFF\":2}]");
    }

    @Test
    @DisplayName("Given strings with quotes, backslashes, control characters and letters beyond ASCII, when they are written canonically, then only quotes, backslashes and control characters are escaped, as JSON.stringify does")
    void should_escape_as_json_stringify_when_strings_are_written_given_special_characters() {
        String written = CanonicalRows.canonical(json.readTree("[\"\\\"\\\\\\b\\f\\n\\r\\t\\u0001\\u001f/é\u2028\"]"));

        assertThat(written).isEqualTo("[\"\\\"\\\\\\b\\f\\n\\r\\t\\u0001\\u001f/é\u2028\"]");
    }

    @Test
    @DisplayName("Given rows, when their digest is taken, then it is the lowercase SHA-256 of the canonical UTF-8 bytes")
    void should_give_the_sha256_of_the_canonical_bytes_when_the_digest_is_taken_given_rows() {
        assertThat(CanonicalRows.sha256(json.readTree("[]"))).isEqualTo("4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
        assertThat(CanonicalRows.sha256(json.readTree("[ { \"b\" : \"\\u001fé\", \"a\" : 1 } ]")))
                .isEqualTo("ab0974e1601d846f12c2037e71a23d1cc4ab9b05a277c9821540061191474b2f");
    }

    @Test
    @DisplayName("Given a row with a fraction, when it is written canonically, then it is refused, because the rows hold integers only")
    void should_refuse_a_fraction_when_rows_are_written_given_a_number_with_a_fraction() {
        assertThatThrownBy(() -> CanonicalRows.canonical(json.readTree("[{\"amount\": 1.5}]"))).isInstanceOf(IllegalArgumentException.class);
    }
}
