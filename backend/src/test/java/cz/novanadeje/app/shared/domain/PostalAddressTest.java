package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PostalAddressTest {

    @Test
    @DisplayName("Given surrounding whitespace, when the address is created, then every part is trimmed")
    void should_trim_parts_when_created_given_surrounding_whitespace() {
        PostalAddress address = new PostalAddress(" Dlouhá 12 ", " Ústí nad Labem ", " 400 01 ");

        assertThat(address.street()).isEqualTo("Dlouhá 12");
        assertThat(address.city()).isEqualTo("Ústí nad Labem");
        assertThat(address.postalCode()).isEqualTo("400 01");
    }

    @Test
    @DisplayName("Given a blank city, when the address is created, then it is rejected")
    void should_reject_when_created_given_blank_city() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PostalAddress("Dlouhá 12", " ", "400 01"));
    }

    @Test
    @DisplayName("Given a postal code without digits, when the address is created, then it is rejected")
    void should_reject_when_created_given_postal_code_without_digits() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PostalAddress("Dlouhá 12", "Most", "ABC"));
    }

    @Test
    @DisplayName("Given an address, when it is formatted, then it renders on a single line")
    void should_render_single_line_when_formatted() {
        assertThat(new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01").singleLine())
                .isEqualTo("Dlouhá 12, 400 01 Ústí nad Labem");
    }
}
