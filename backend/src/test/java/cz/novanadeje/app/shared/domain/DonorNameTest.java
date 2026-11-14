package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class DonorNameTest {

    @Test
    @DisplayName("Given a name with surrounding spaces, when the name is created, then it is trimmed")
    void should_trim_when_created_given_padded_name() {
        assertThat(new DonorName("  Jana Nováková ").value()).isEqualTo("Jana Nováková");
    }

    @Test
    @DisplayName("Given a name of the longest allowed length, when the name is created, then it is accepted")
    void should_accept_when_created_given_longest_name() {
        assertThat(new DonorName(" " + "x".repeat(DonorName.MAX_LENGTH) + " ").value()).hasSize(160);
    }

    @Test
    @DisplayName("Given a name one character too long, when the name is created, then it is refused naming the rule without the name")
    void should_refuse_without_the_name_when_created_given_overlong_name() {
        assertThatIllegalArgumentException().isThrownBy(() -> new DonorName("x".repeat(161)))
                .withMessage("Name must not exceed 160 characters");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t\n", "\u2003"})
    @DisplayName("Given a blank name, when the name is created, then it is refused")
    void should_refuse_when_created_given_blank_name(String blank) {
        assertThatIllegalArgumentException().isThrownBy(() -> new DonorName(blank)).withMessage("Name is required");
    }

    @Test
    @DisplayName("Given no name, when the name is created, then it is refused")
    void should_refuse_when_created_given_no_name() {
        assertThatIllegalArgumentException().isThrownBy(() -> new DonorName(null)).withMessage("Name is required");
    }

    @Test
    @DisplayName("Given a name, when it is turned into text, then the text is the name")
    void should_be_the_name_when_turned_into_text_given_name() {
        assertThat(new DonorName("Stavby Novák s.r.o.")).hasToString("Stavby Novák s.r.o.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"   ", "\t\n", "\u2003", "\u00a0", "Jana", " J ", "\u2003Jana", "Jana\nNováková"})
    @DisplayName("Given a name, when its shape is checked, then the request's pattern refuses exactly the names a donor name refuses as blank")
    void should_refuse_exactly_blank_names_when_shape_checked_given_name(String name) {
        assertThat(Pattern.matches(DonorName.NOT_BLANK, name)).isEqualTo(!name.isBlank());
    }
}
