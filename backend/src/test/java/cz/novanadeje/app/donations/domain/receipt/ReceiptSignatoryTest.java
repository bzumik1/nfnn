package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.params.provider.Arguments.arguments;

class ReceiptSignatoryTest {

    private static final PersonReference PERSON = new PersonReference(UUID.fromString("019a3a00-0000-7000-8000-00000000f001"));
    private static final Instant AT = Instant.parse("2026-10-31T09:00:00Z");

    @Test
    @DisplayName("Given a role with spaces around, when the signatory is made, then the role is trimmed")
    void should_trim_the_role_when_made_given_spaces_around() {
        assertThat(new ReceiptSignatory(PERSON, "  předseda správní rady ", AT).receiptRole()).isEqualTo("předseda správní rady");
    }

    @ParameterizedTest(name = "Given a role {0}, when the signatory is made, then it is refused")
    @MethodSource("refusedRoles")
    @DisplayName("Given a blank role or a role holding a control character, when the signatory is made, then it is refused")
    void should_refuse_the_role_when_made_given_blank_or_control_character(String description, String role) {
        assertThatThrownBy(() -> new ReceiptSignatory(PERSON, role, AT)).isInstanceOf(IllegalArgumentException.class);
    }

    static Stream<Arguments> refusedRoles() {
        return Stream.of(
                arguments("of spaces only", "   "),
                arguments("with a line break", "předseda\nsprávní rady"),
                arguments("with a tab", "předseda\tsprávní rady"),
                arguments("with a NUL character", "předseda\u0000"),
                arguments("with a C1 control character", "předseda\u009b"));
    }

    @Test
    @DisplayName("Given a role one character over the limit, when the signatory is made, then it is refused, and a role at the limit passes")
    void should_refuse_the_role_when_made_given_one_character_over_the_limit() {
        String role = "x".repeat(ReceiptSignatory.MAX_ROLE_LENGTH);

        assertThat(new ReceiptSignatory(PERSON, role, AT).receiptRole()).isEqualTo(role);
        assertThatThrownBy(() -> new ReceiptSignatory(PERSON, role + "x", AT)).isInstanceOf(IllegalArgumentException.class);
    }
}
