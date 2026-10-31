package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class DonorNameShapeTest {

    @ParameterizedTest
    @ValueSource(strings = {"   ", "\t\n", " ", " ", "Jana", " J ", " Jana", "Jana\nNováková"})
    @DisplayName("Given a name, when its shape is checked, then the request's pattern refuses exactly the names a donor refuses as blank")
    void should_refuse_exactly_blank_names_when_shape_checked_given_name(String name) {
        assertThat(Pattern.matches(Donor.NOT_BLANK_NAME, name)).isEqualTo(!name.isBlank());
    }
}
