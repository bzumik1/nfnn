package cz.novanadeje.app.regression;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineRowsTest {

    private static final List<String> ROW_FIELDS = List.of("now", "donors", "payments", "donations");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @ParameterizedTest
    @ValueSource(strings = {OverviewGoldenCasesTest.ADMIN_OVERVIEW_CASES, OverviewGoldenCasesTest.DONOR_SUMMARY_CASES,
            OverviewGoldenCasesTest.MONTHLY_REPORT_CASES})
    @DisplayName("Given the recorded cases over database rows, when each case's rows are read from its input and written again, then they equal the input's rows")
    void should_equal_the_input_rows_when_each_case_is_read_from_its_input_and_written_again(String cases) throws IOException {
        JsonNode file = JSON.readTree(Files.readString(GoldenFiles.repositoryRoot().resolve(cases), StandardCharsets.UTF_8));
        assertThat(file.get("cases").isEmpty()).as("cases in %s", cases).isFalse();

        for (JsonNode entry : file.get("cases")) {
            ObjectNode rows = JSON.createObjectNode();
            ROW_FIELDS.forEach(field -> rows.set(field, entry.get("input").get(field)));

            assertThat(GoldenFiles.canonical(BaselineRows.fromJson(entry.get("input")).toJson())).as("%s: %s", cases, entry.get("name").asString())
                    .isEqualTo(GoldenFiles.canonical(rows));
        }
    }
}
