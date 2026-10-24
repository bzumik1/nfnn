package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SecondFactorRecoveryCodeTest {

    @RepeatedTest(20)
    @DisplayName("Given nothing, when a code is generated, then it has eight characters without letters and digits that look alike")
    void should_have_eight_unambiguous_characters_when_generated() {
        assertThat(SecondFactorRecoveryCode.generate(new SecureRandom()).value()).matches("[A-HJ-NP-Z2-9]{8}");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "ABCD234", "ABCD23456", "ABCD2341", "ABCD234O", "abcd2345", "ABCD 234"})
    @DisplayName("Given anything but eight unambiguous characters, when the code is created, then it is rejected")
    void should_reject_when_created_given_a_wrong_shape(String value) {
        assertThatIllegalArgumentException().isThrownBy(() -> new SecondFactorRecoveryCode(value));
    }

    @Test
    @DisplayName("Given a code, when its payment message is read, then it is the word OBNOVA and the code")
    void should_put_the_code_after_obnova_when_the_message_is_read() {
        assertThat(new SecondFactorRecoveryCode("ABCD2345").message()).isEqualTo("OBNOVA ABCD2345");
    }

    @ParameterizedTest
    @ValueSource(strings = {"OBNOVA ABCD2345", "obnova abcd2345", "Obnova: ABCD-2345", "Dar OBNOVA ABCD 2345 díky", "OBNOVAABCD2345",
            "ÓBNOVA ABCD2345"})
    @DisplayName("Given a bank message carrying the code as the donor may have typed it, when the code is looked for, then it is found")
    void should_find_the_code_when_looked_for_given_a_message_as_typed(String message) {
        assertThat(SecondFactorRecoveryCode.findIn(message)).contains(new SecondFactorRecoveryCode("ABCD2345"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "ABCD2345", "OBNOVA", "OBNOVA ABCD234", "OBNOVA ABCD23456", "OBNOVA ABCD2341", "Ověření účtu"})
    @DisplayName("Given a bank message without a whole code after OBNOVA, when the code is looked for, then none is found")
    void should_find_nothing_when_looked_for_given_no_whole_code(String message) {
        assertThat(SecondFactorRecoveryCode.findIn(message)).isEmpty();
    }

    @Test
    @DisplayName("Given a code, when it is hashed, then the hash is the hex SHA-256 of the code and the text never shows the code")
    void should_hash_with_sha256_and_mask_the_text_when_hashed() {
        SecondFactorRecoveryCode code = new SecondFactorRecoveryCode("ABCD2345");

        assertThat(code.hash()).hasSize(64).matches("[0-9a-f]{64}").isEqualTo(new SecondFactorRecoveryCode("ABCD2345").hash());
        assertThat(code.hash()).isNotEqualTo(new SecondFactorRecoveryCode("ABCD2346").hash());
        assertThat(code.toString()).doesNotContain("ABCD2345");
    }
}
