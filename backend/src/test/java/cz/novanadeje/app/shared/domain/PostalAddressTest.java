package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PostalAddressTest {

    @Test
    void should_trim_parts_when_created_given_surrounding_whitespace() {
        PostalAddress address = new PostalAddress(" Dlouhá 12 ", " Ústí nad Labem ", " 400 01 ");

        assertThat(address.street()).isEqualTo("Dlouhá 12");
        assertThat(address.city()).isEqualTo("Ústí nad Labem");
        assertThat(address.postalCode()).isEqualTo("400 01");
    }

    @Test
    void should_reject_when_created_given_blank_city() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PostalAddress("Dlouhá 12", " ", "400 01"));
    }

    @Test
    void should_reject_when_created_given_postal_code_without_digits() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PostalAddress("Dlouhá 12", "Most", "ABC"));
    }

    @Test
    void should_render_single_line_when_formatted() {
        assertThat(new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01").singleLine())
                .isEqualTo("Dlouhá 12, 400 01 Ústí nad Labem");
    }
}
