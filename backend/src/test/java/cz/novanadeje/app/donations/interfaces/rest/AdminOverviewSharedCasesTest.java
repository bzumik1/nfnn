package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminOverviewSharedCasesTest extends DonationRowsSharedCaseRunner {

    @Override
    protected String caseFile() {
        return "admin-overview/year-overview.json";
    }

    @Override
    protected String when() {
        return "when the backend selects its rows with the real queries and compiles the year overview, alone and in the administration's sync manifest";
    }

    @Override
    protected String then() {
        return "then the administration gets the expected overview, and the manifest's summary of that year is the same";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        CaseRows rows = writeRows(sharedCase.input());
        rows.writeAdministrator(jdbc());
        MockHttpServletRequestBuilder call = get("/api/admin/donations/overview");
        JsonNode year = sharedCase.input().get("year");
        if (!year.isNull()) {
            call = call.param("year", Integer.toString(year.asInt()));
        }

        assertGives(answerAs(CaseRows.administratorId(), "ROLE_ADMIN", call), sharedCase.expected());
        assertGives(summaryOfTheYearIn(answerAs(CaseRows.administratorId(), "ROLE_ADMIN", get("/api/admin/donations/sync")), sharedCase.expected()),
                withoutAvailableYears(sharedCase.expected()));
    }

    private static JsonNode summaryOfTheYearIn(JsonNode manifest, JsonNode expected) {
        List<JsonNode> years = manifest.get("summary").get("byYear").valueStream().toList();
        assertThat(years).as("the years of the manifest's summary").extracting(entry -> entry.get("year").asInt())
                .containsExactlyElementsOf(expected.get("availableYears").valueStream().map(JsonNode::asInt).toList());
        return years.stream().filter(entry -> entry.get("year").asInt() == expected.get("year").asInt()).findFirst().orElseThrow();
    }

    private static JsonNode withoutAvailableYears(JsonNode expected) {
        ObjectNode copy = (ObjectNode) expected.deepCopy();
        copy.remove("availableYears");
        return copy;
    }
}
