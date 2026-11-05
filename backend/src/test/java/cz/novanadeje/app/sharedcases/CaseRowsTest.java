package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.support.CanonicalJson;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CaseRowsTest {

    private static final List<String> ROW_FIELDS = List.of("now", "donors", "payments", "donations");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @ParameterizedTest
    @ValueSource(strings = {"shared-cases/admin-overview/year-overview.json", "shared-cases/donor-summary/summary.json",
            "shared-cases/monthly-report/report.json", "shared-cases/sync/manifest.json"})
    @DisplayName("Given the recorded cases over database rows, when each case's rows are read from its input and written again, then they equal the input's rows")
    void should_equal_the_input_rows_when_each_case_is_read_from_its_input_and_written_again(String cases) throws IOException {
        JsonNode file = JSON.readTree(Files.readString(SharedCases.repositoryRoot().resolve(cases), StandardCharsets.UTF_8));
        assertThat(file.get("cases").isEmpty()).as("cases in %s", cases).isFalse();

        for (JsonNode entry : file.get("cases")) {
            ObjectNode rows = JSON.createObjectNode();
            ROW_FIELDS.forEach(field -> rows.set(field, entry.get("input").get(field)));

            assertThat(CanonicalJson.write(CaseRows.fromJson(entry.get("input")).toJson())).as("%s: %s", cases, entry.get("name").asString())
                    .isEqualTo(CanonicalJson.write(rows));
        }
    }

    @Test
    @DisplayName("Given a payment without the instant of an unpairing and one an administrator unpaired, when the rows are read and written as JSON, then only the second names the instant")
    void should_name_the_instant_only_for_the_second_when_the_rows_are_read_and_written_given_a_payment_without_an_unpairing_and_one_unpaired_by_an_administrator() {
        JsonNode input = JSON.readTree("""
                {"now": "2026-03-20T09:00:00Z", "donors": [], "donations": [],
                 "payments": [{"alias": "p1", "bookedOn": "2026-02-20", "amountMinor": 4550},
                              {"alias": "p2", "bookedOn": "2026-03-03", "amountMinor": 7000, "unpairedByAdminAt": "2026-03-03T13:00:00Z"}]}""");

        assertThat(CanonicalJson.write(CaseRows.fromJson(input).toJson().get("payments"))).isEqualTo(CanonicalJson.write(JSON.readTree("""
                [{"alias": "p1", "bookedOn": "2026-02-20", "amountMinor": 4550, "unpairedByAdminAt": null},
                 {"alias": "p2", "bookedOn": "2026-03-03", "amountMinor": 7000, "unpairedByAdminAt": "2026-03-03T13:00:00Z"}]""")));
    }

    @Test
    @DisplayName("Given rows written to the database, when an answer naming their ids is aliased, then every id is the alias of its row, the n-th donation of the input donation:n, and every other value stays")
    void should_name_every_row_by_its_alias_when_an_answer_is_aliased_given_rows_written_to_the_database() {
        ObjectNode input = JSON.createObjectNode();
        input.put("now", "2026-10-20T10:00:00Z");
        input.set("donors", JSON.readTree("[{\"alias\":\"jana\",\"registeredAt\":\"2026-01-15T10:00:00Z\",\"erasedAt\":null}]"));
        input.set("payments", JSON.readTree("[{\"alias\":\"p1\",\"bookedOn\":\"2026-02-01\",\"amountMinor\":100,\"unpairedByAdminAt\":null}]"));
        input.set("donations", JSON.readTree("[{\"donor\":\"jana\",\"payment\":\"p1\",\"receivedOn\":\"2026-02-01\",\"amountMinor\":100,"
                + "\"status\":\"RECEIVED\",\"source\":\"BANK_TRANSFER\",\"purpose\":\"GENERAL\"},{\"donor\":\"jana\",\"payment\":null,"
                + "\"receivedOn\":\"2026-02-02\",\"amountMinor\":200,\"status\":\"RECEIVED\",\"source\":\"MANUAL\",\"purpose\":\"GENERAL\"}]"));
        CaseRows rows = CaseRows.fromJson(input);
        UUID jana = new UUID(0x0190a000_0000_7000L, 0x8000_0000_0000_0001L);
        UUID secondGift = new UUID(0x0190a000_0000_7000L, 0x8000_0000_0000_0004L);

        JsonNode aliased = rows.aliased(JSON.readTree("{\"subject\":\"" + jana + "\",\"rows\":[{\"id\":\"" + secondGift
                + "\",\"note\":\"other\",\"amountMinor\":200}]}"));

        assertThat(aliased.toString()).isEqualTo("{\"subject\":\"donor:jana\",\"rows\":[{\"id\":\"donation:2\",\"note\":\"other\",\"amountMinor\":200}]}");
    }
}
