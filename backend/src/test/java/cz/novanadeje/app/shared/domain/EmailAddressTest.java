package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class EmailAddressTest {

    @Test
    @DisplayName("Given surrounding whitespace and capitals, when the address is created, then it keeps the trimmed lowercase value")
    void should_keep_trimmed_lowercase_value_when_created_given_surrounding_whitespace_and_capitals() {
        assertThat(new EmailAddress("  Jana@Example.cz ").value()).isEqualTo("jana@example.cz");
    }

    @Test
    @DisplayName("Given a value without an at sign, when the address is created, then it is rejected")
    void should_reject_when_created_given_value_without_at_sign() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress("jana.example.cz"));
    }

    @Test
    @DisplayName("Given a value with whitespace inside, when the address is created, then it is rejected")
    void should_reject_when_created_given_value_with_whitespace_inside() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress("jana @example.cz"));
    }

    @Test
    @DisplayName("Given null, when the address is created, then it is rejected")
    void should_reject_when_created_given_null() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress(null));
    }

    @Test
    @DisplayName("Given more than 254 characters, when the address is created, then it is rejected")
    void should_reject_when_created_given_more_than_254_characters() {
        String local = "a".repeat(250);
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress(local + "@ex.cz"));
    }
}
