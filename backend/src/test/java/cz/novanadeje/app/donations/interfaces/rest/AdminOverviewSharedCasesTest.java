package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminOverviewSharedCasesTest extends DonationRowsSharedCaseRunner {

    @Override
    protected String caseFile() {
        return "admin-overview/year-overview.json";
    }

    @Override
    protected String when() {
        return "when the backend selects its rows with the real queries and compiles the year overview";
    }

    @Override
    protected String then() {
        return "then the administration gets the expected overview";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        writeRows(sharedCase.input());
        MockHttpServletRequestBuilder call = get("/api/admin/donations/overview");
        JsonNode year = sharedCase.input().get("year");
        if (!year.isNull()) {
            call = call.param("year", Integer.toString(year.asInt()));
        }

        assertGives(answerAs(CaseRows.administratorId(), "ROLE_ADMIN", call), sharedCase.expected());
    }
}
