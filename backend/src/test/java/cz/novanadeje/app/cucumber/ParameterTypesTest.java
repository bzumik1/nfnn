package cz.novanadeje.app.cucumber;

import io.cucumber.java.ParameterType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class ParameterTypesTest {

    @Test
    @DisplayName("Given an ISO calendar date in a step, when the date parameter type converts it, then it becomes that LocalDate")
    void should_convert_to_local_date_when_date_parameter_used_given_iso_text() {
        assertThat(new ParameterTypes().date("2026-10-17")).isEqualTo(LocalDate.of(2026, 10, 17));
    }

    @Test
    @DisplayName("Given the date parameter type, when Cucumber reads its pattern, then it matches yyyy-mm-dd and nothing looser")
    void should_match_only_iso_dates_when_pattern_read_given_date_parameter_type() throws NoSuchMethodException {
        String pattern = ParameterTypes.class.getMethod("date", String.class).getAnnotation(ParameterType.class).value();

        assertThat("2026-10-17").matches(pattern);
        assertThat("17.10.2026").doesNotMatch(pattern);
        assertThat("2026-1-7").doesNotMatch(pattern);
    }
}
