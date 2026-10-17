package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class EmailAddressTest {

    @Test
    void should_keep_trimmed_value_when_created_given_surrounding_whitespace() {
        assertThat(new EmailAddress("  jana@example.cz ").value()).isEqualTo("jana@example.cz");
    }

    @Test
    void should_reject_when_created_given_value_without_at_sign() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress("jana.example.cz"));
    }

    @Test
    void should_reject_when_created_given_value_with_whitespace_inside() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress("jana @example.cz"));
    }

    @Test
    void should_reject_when_created_given_null() {
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress(null));
    }

    @Test
    void should_reject_when_created_given_more_than_254_characters() {
        String local = "a".repeat(250);
        assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress(local + "@ex.cz"));
    }
}
