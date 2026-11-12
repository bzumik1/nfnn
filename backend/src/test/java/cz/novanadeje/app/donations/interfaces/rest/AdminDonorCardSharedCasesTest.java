package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.AdministrationCopyCaseRunner;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.sharedcases.SharedCase;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class AdminDonorCardSharedCasesTest extends AdministrationCopyCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final String SERVER_ONLY = "bankAccounts";

    @Autowired
    private FirstReceiptYear firstReceiptYear;

    @Override
    protected String caseFile() {
        return "admin-donors/donor-card.json";
    }

    @Override
    protected List<String> copiedKinds() {
        return List.of("donations/donor-records", "donations/donations", "donations/links", "donations/symbol-claims", "donations/receipts");
    }

    @Override
    protected String when() {
        return "when the backend reads the rows with the real queries and an administrator opens each donor's card in Czech";
    }

    @Override
    protected String then() {
        return "then the device copy holds the case's chunks and summary and each card shows the expected record, gifts, receipts and receipt years";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        assertThat(firstReceiptYear.year().getValue()).as("the first receipt year this runner's backend is configured with")
                .isEqualTo(input.get("summary").get("receiptsAvailableFrom").asInt());
        CaseRows rows = writeRowsAndAdministrator(input);
        assertTheCopyIsTheInputs(rows, input);
        ArrayNode answers = NODES.arrayNode();
        for (JsonNode query : input.get("queries")) {
            ObjectNode card = (ObjectNode) rows.aliased(asAdministrator(get("/api/admin/donations/donors/"
                    + rows.donorId(query.get("donor").asString()))));
            card.remove(SERVER_ONLY);
            answers.add(card);
        }
        ObjectNode given = NODES.objectNode();
        given.set("answers", answers);
        assertGives(given, sharedCase.expected());
    }
}
