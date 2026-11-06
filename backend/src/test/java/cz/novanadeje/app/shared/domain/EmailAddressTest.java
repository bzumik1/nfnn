package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
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

    @Test
    @DisplayName("Given a long run of dots between two at signs, when the shape pattern alone checks it, then it refuses it at once")
    void should_refuse_at_once_when_shape_pattern_checks_given_long_run_of_dots_between_at_signs() {
        String hostile = "a@" + ".".repeat(200_000) + "@";
        Pattern shape = Pattern.compile(EmailAddress.SHAPE_REGEX);

        boolean matches = assertTimeoutPreemptively(Duration.ofSeconds(2), () -> shape.matcher(hostile).matches());

        assertThat(matches).isFalse();
    }

    @Test
    @DisplayName("Given an address of exactly 254 characters, when the shape pattern alone checks it, then it accepts it")
    void should_accept_when_shape_pattern_checks_given_address_of_254_characters() {
        String address = "a".repeat(64) + "@" + "b".repeat(186) + ".cz";

        assertThat(address).hasSize(EmailAddress.MAX_LENGTH);
        assertThat(Pattern.compile(EmailAddress.SHAPE_REGEX).matcher(address).matches()).isTrue();
    }

    @Test
    @DisplayName("Given an address of 255 characters, when the shape pattern alone checks it, then it refuses it")
    void should_refuse_when_shape_pattern_checks_given_address_of_255_characters() {
        String address = "a".repeat(65) + "@" + "b".repeat(186) + ".cz";

        assertThat(Pattern.compile(EmailAddress.SHAPE_REGEX).matcher(address).matches()).isFalse();
    }
}
