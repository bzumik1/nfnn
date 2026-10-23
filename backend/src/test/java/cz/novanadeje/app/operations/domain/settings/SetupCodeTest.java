package cz.novanadeje.app.operations.domain.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

class SetupCodeTest {

    @Test
    @DisplayName("Given a random source, when a code is generated, then it has twelve unambiguous characters shown in groups of four")
    void should_generate_twelve_unambiguous_characters_when_generated_given_random_source() {
        SetupCode code = SetupCode.generate(new Random(7));

        assertThat(code.value()).hasSize(12).matches("[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}");
        assertThat(code.display()).matches("[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}");
    }

    @Test
    @DisplayName("Given the code typed in lower case with spaces or dashes, when it is compared, then it matches")
    void should_match_when_compared_given_code_typed_loosely() {
        SetupCode code = new SetupCode("K7QM2XPA9TRD");

        assertThat(code.matches("k7qm 2xpa-9trd")).isTrue();
        assertThat(code.matches("K7QM-2XPA-9TRD")).isTrue();
    }

    @Test
    @DisplayName("Given another code, nothing or the code with a missing character, when it is compared, then it does not match")
    void should_not_match_when_compared_given_wrong_input() {
        SetupCode code = new SetupCode("K7QM2XPA9TRD");

        assertThat(code.matches("K7QM2XPA9TRE")).isFalse();
        assertThat(code.matches("K7QM2XPA9TR")).isFalse();
        assertThat(code.matches(null)).isFalse();
        assertThat(code.matches("")).isFalse();
    }

    @Test
    @DisplayName("Given a code, when it is printed, then the value is masked")
    void should_mask_value_when_printed_given_code() {
        assertThat(new SetupCode("K7QM2XPA9TRD").toString()).doesNotContain("K7QM");
    }
}
