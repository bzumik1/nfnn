package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.AdministrationCopyCaseRunner;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminOverviewSharedCasesTest extends AdministrationCopyCaseRunner {

    @Override
    protected List<String> copiedKinds() {
        return List.of("donations/payments", "donations/donations", "donations/donor-records");
    }

    @Override
    protected String caseFile() {
        return "admin-overview/year-overview.json";
    }

    @Override
    protected String when() {
        return "when the backend selects its rows with the real queries and compiles the year overview, alone and in the administration's sync manifest for every offered year, beside the chunks of the device copy";
    }

    @Override
    protected String then() {
        return "then the administration gets the expected overview, the manifest's summary of that year and of every other offered year is the overview of that year, and the copy holds the case's chunks";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        CaseRows rows = writeRowsAndAdministrator(sharedCase.input());
        assertTheCopyIsTheInputs(rows, sharedCase.input());
        MockHttpServletRequestBuilder call = get("/api/admin/donations/overview");
        JsonNode year = sharedCase.input().get("year");
        if (!year.isNull()) {
            call = call.param("year", Integer.toString(year.asInt()));
        }

        assertGives(answerAs(CaseRows.administratorId(), "ROLE_ADMIN", call), sharedCase.expected());
        List<JsonNode> summary = summaryIn(answerAs(CaseRows.administratorId(), "ROLE_ADMIN", get("/api/admin/donations/sync")), sharedCase.expected());
        Optional<JsonNode> ofTheYear = summary.stream().filter(entry -> entry.get("year").asInt() == sharedCase.expected().get("year").asInt()).findFirst();
        if (offers(sharedCase.expected(), sharedCase.expected().get("year").asInt())) {
            assertGives(ofTheYear.orElseThrow(), withoutAvailableYears(sharedCase.expected()));
        } else {
            assertThat(ofTheYear).as("the summary of a year the administration does not offer").isEmpty();
        }
        for (JsonNode entry : summary) {
            JsonNode overview = answerAs(CaseRows.administratorId(), "ROLE_ADMIN", get("/api/admin/donations/overview").param("year", entry.get("year").asString()));
            assertGives(entry, withoutAvailableYears(overview));
        }
    }

    private static List<JsonNode> summaryIn(JsonNode manifest, JsonNode expected) {
        List<JsonNode> years = manifest.get("summary").get("byYear").valueStream().toList();
        assertThat(years).as("the years of the manifest's summary").extracting(entry -> entry.get("year").asInt())
                .containsExactlyElementsOf(expected.get("availableYears").valueStream().map(JsonNode::asInt).toList());
        return years;
    }

    private static boolean offers(JsonNode expected, int year) {
        return expected.get("availableYears").valueStream().anyMatch(offered -> offered.asInt() == year);
    }

    private static JsonNode withoutAvailableYears(JsonNode expected) {
        ObjectNode copy = (ObjectNode) expected.deepCopy();
        copy.remove("availableYears");
        return copy;
    }
}
