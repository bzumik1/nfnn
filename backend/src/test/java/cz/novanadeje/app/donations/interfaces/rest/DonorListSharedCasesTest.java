package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.DonationRowsSharedCaseRunner;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class DonorListSharedCasesTest extends DonationRowsSharedCaseRunner {

    @Autowired
    private FirstReceiptYear firstReceiptYear;

    @Override
    protected String caseFile() {
        return "donor-donations/list.json";
    }

    @Override
    protected String when() {
        return "when the backend reads the donor's donations with the real query and lists them in Czech";
    }

    @Override
    protected String then() {
        return "then the donor gets the expected gifts in the expected order";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        assertThat(firstReceiptYear.year().getValue()).as("the first receipt year this runner's backend is configured with")
                .isEqualTo(input.get("firstReceiptYear").asInt());
        CaseRows rows = writeRows(input);
        UUID donor = rows.donorId(input.get("donor").asString());

        JsonNode listed = answerAs(donor, "ROLE_DONOR", get("/api/donations/me"));
        ObjectNode items = JsonNodeFactory.instance.objectNode();
        items.set("items", listed.get("items"));

        assertGives(rows.aliased(items), sharedCase.expected());
    }
}
