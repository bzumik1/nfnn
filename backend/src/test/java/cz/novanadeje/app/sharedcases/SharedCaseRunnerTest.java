package cz.novanadeje.app.sharedcases;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SharedCaseRunnerTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final JsonNode EXPECTED = JSON.readTree("""
            {"year": 2026, "months": [{"month": "2026-03", "newDonors": 1}]}""");

    @Test
    @DisplayName("Given an expected value, when the backend gives the same fields and values, then the case passes")
    void should_pass_when_the_backend_gives_the_same_fields_and_values_given_an_expected_value() {
        assertThatCode(() -> SharedCaseRunner.assertGives(JSON.readTree("""
                {"year": 2026, "months": [{"month": "2026-03", "newDonors": 1}]}"""), EXPECTED)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given an expected value, when the backend gives a field more in a month, then the case fails")
    void should_fail_when_the_backend_gives_a_field_more_in_a_month_given_an_expected_value() {
        assertThatThrownBy(() -> SharedCaseRunner.assertGives(JSON.readTree("""
                {"year": 2026, "months": [{"month": "2026-03", "newDonors": 1, "givingDonors": 1}]}"""), EXPECTED))
                .isInstanceOf(AssertionError.class).hasMessageContaining("givingDonors");
    }

    @Test
    @DisplayName("Given an expected value, when the backend leaves out one of its fields, then the case fails")
    void should_fail_when_the_backend_leaves_out_one_of_its_fields_given_an_expected_value() {
        assertThatThrownBy(() -> SharedCaseRunner.assertGives(JSON.readTree("""
                {"year": 2026, "months": [{"month": "2026-03"}]}"""), EXPECTED))
                .isInstanceOf(AssertionError.class).hasMessageContaining("newDonors");
    }

    @Test
    @DisplayName("Given an expected value, when the backend gives another value of one field, then the case fails")
    void should_fail_when_the_backend_gives_another_value_of_one_field_given_an_expected_value() {
        assertThatThrownBy(() -> SharedCaseRunner.assertGives(JSON.readTree("""
                {"year": 2026, "months": [{"month": "2026-03", "newDonors": 2}]}"""), EXPECTED))
                .isInstanceOf(AssertionError.class);
    }
}
