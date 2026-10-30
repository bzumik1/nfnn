package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class DonorSummarySharedCasesTest extends DonationRowsSharedCaseRunner {

    @Autowired
    private FirstReceiptYear firstReceiptYear;

    @Override
    protected String caseFile() {
        return "donor-summary/summary.json";
    }

    @Override
    protected String when() {
        return "when the backend reads the donor's donations with the real query and summarizes them";
    }

    @Override
    protected String then() {
        return "then the donor gets the expected summary";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        assertThat(firstReceiptYear.year().getValue()).as("the first receipt year this runner's backend is configured with")
                .isEqualTo(sharedCase.input().get("firstReceiptYear").asInt());
        CaseRows rows = writeRows(sharedCase.input());

        assertGives(answerAs(rows.donorId(sharedCase.input().get("donor").asString()), "ROLE_DONOR", get("/api/donations/me/summary")), sharedCase.expected());
    }
}
